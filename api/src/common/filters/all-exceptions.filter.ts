import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { checkViolationMessage } from './check-constraints';
import { Prisma } from '../../generated/prisma/client';
import { DomainError, type DomainErrorKind, type ErrorDetail } from '../errors/domain-error';
import { PROBLEMS, problemType, type ProblemCode } from '../errors/problem-codes';

/** The HTTP status of each domain error. The only place that knows it. */
const DOMAIN_ERROR_STATUS: Readonly<Record<DomainErrorKind, number>> = {
  bad_request: HttpStatus.BAD_REQUEST,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  duplicate: HttpStatus.CONFLICT,
  payload_too_large: HttpStatus.PAYLOAD_TOO_LARGE,
  unsupported_media_type: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  validation: HttpStatus.UNPROCESSABLE_ENTITY,
  internal: HttpStatus.INTERNAL_SERVER_ERROR,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

/** Kinds whose v1 `code` is not the generic one of their status. */
const DOMAIN_ERROR_CODE: Readonly<Partial<Record<DomainErrorKind, string>>> = {
  // The same code an unhandled P2002 gets below.
  duplicate: 'duplicate',
};

/** The v2 code of a domain error that does not name its rule. */
const DOMAIN_ERROR_PROBLEM: Readonly<Record<DomainErrorKind, ProblemCode>> = {
  bad_request: 'bad_request',
  unauthenticated: 'unauthenticated',
  forbidden: 'forbidden',
  not_found: 'not_found',
  conflict: 'conflict',
  duplicate: 'duplicate',
  payload_too_large: 'payload_too_large',
  unsupported_media_type: 'unsupported_media_type',
  validation: 'validation_failed',
  internal: 'internal_error',
  unavailable: 'service_unavailable',
};

/** The v2 code of a status nothing more specific was said about. */
const STATUS_PROBLEM: Readonly<Record<number, ProblemCode>> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthenticated',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload_too_large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'unsupported_media_type',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'validation_failed',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
};

/** 500 as a plain number: `status` is a number, not the enum. */
const FIRST_SERVER_ERROR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** Everything both wire formats are written from. */
interface Normalized {
  status: number;
  /** v1 `error.code`: generic per status, as it always was. */
  code: string;
  /** v2 `code`: the rule, when there is one. */
  problem: ProblemCode;
  message: string;
  /** v1 `error.details`. */
  details: ErrorDetail[];
  /** v2 `errors`: the same problems, with the field when it is known. */
  errors: ErrorDetail[];
}

/** RFC 9457 body of a v2 error. */
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: ProblemCode;
  errors?: ErrorDetail[];
}

export const PROBLEM_JSON = 'application/problem+json';

/** A request to v2, by its path: errors before routing included. */
function isV2(request: Request): boolean {
  const path = (request.originalUrl || request.url).split('?')[0] ?? '';
  return path === '/api/v2' || path.startsWith('/api/v2/');
}

/** The v2 body of a normalized error. */
function toProblem(error: Omit<Normalized, 'code' | 'details'>): ProblemDetails {
  return {
    type: problemType(error.problem),
    title: PROBLEMS[error.problem].title,
    status: error.status,
    detail: error.message,
    code: error.problem,
    ...(error.errors.length > 0 && { errors: error.errors }),
  };
}

/**
 * Gives ALL of the API's errors one shape.
 *
 * Two audiences, two levels of detail:
 *   · To the client: the right status and never a stack trace or SQL —leaking
 *     them hands an attacker the map of the app—. In v1,
 *     `{ error: { code, message, details } }`; in v2, `application/problem+json`
 *     (RFC 9457) with a stable `code` per business rule.
 *   · To the server log: the full detail, to be able to debug.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  private static readonly STATUS_CODES: Readonly<Record<number, string>> = {
    [HttpStatus.BAD_REQUEST]: 'bad_request',
    [HttpStatus.UNAUTHORIZED]: 'unauthenticated',
    [HttpStatus.FORBIDDEN]: 'forbidden',
    [HttpStatus.NOT_FOUND]: 'not_found',
    [HttpStatus.CONFLICT]: 'conflict',
    [HttpStatus.UNPROCESSABLE_ENTITY]: 'unprocessable',
    [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
  };

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const error = this.normalize(exception);
    const { status, code, message, details } = error;

    // The log carries the internal user_id and the path, never amounts or descriptions.
    const who = request.user ? `user=${request.user.id}` : 'anon';
    // Path only: the query string carries search terms and other personal data.
    const line = `${request.method} ${request.url.split('?')[0]} → ${status} [${error.problem}] ${who}`;

    if (status >= FIRST_SERVER_ERROR) {
      this.logger.error(line, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(line);
    }

    if (isV2(request)) {
      response.status(status).setHeader('Content-Type', `${PROBLEM_JSON}; charset=utf-8`);
      response.json(toProblem(error));
      return;
    }
    response.status(status).json({ error: { code, message, details } });
  }

  private normalize(exception: unknown): Normalized {
    if (isDomainError(exception)) {
      return this.fromDomainError(exception);
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    // A CHECK constraint is a business rule the request broke: 422, with the
    // rule said in words. Prisma may surface it as known or unknown.
    if (
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientKnownRequestError
    ) {
      const message = checkViolationMessage(exception.message);
      if (message !== null) {
        return plain(HttpStatus.UNPROCESSABLE_ENTITY, 'unprocessable', 'check_violation', message);
      }
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // An invalid data shape that reached Prisma: it is our bug, not the
      // client's. It is logged as a 500 without revealing the schema's detail.
      return plain(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'internal_error',
        'internal_error',
        'Ocurrió un error procesando la solicitud.',
      );
    }

    return plain(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'internal_error',
      'internal_error',
      'Ocurrió un error inesperado. Intenta de nuevo.',
    );
  }

  /**
   * A domain error goes out exactly as the Nest exception it replaced did:
   * same status, same `code` (from the same table), same message, and the
   * details it carries. v2 adds the rule's own code.
   */
  private fromDomainError(exception: DomainError): Normalized {
    const status = DOMAIN_ERROR_STATUS[exception.kind];
    return {
      status,
      code:
        DOMAIN_ERROR_CODE[exception.kind] ?? AllExceptionsFilter.STATUS_CODES[status] ?? 'error',
      problem: exception.code ?? DOMAIN_ERROR_PROBLEM[exception.kind],
      message: exception.message,
      details: [...exception.details],
      errors: [...exception.details],
    };
  }

  private fromHttpException(exception: HttpException): Normalized {
    const status = exception.getStatus();
    // `unknown`: the type says `string | object`, but a hand-built exception
    // can carry anything, null included.
    const payload: unknown = exception.getResponse();
    const details: ErrorDetail[] = [];
    let fields: ErrorDetail[] | undefined;
    let message = exception.message;

    if (typeof payload === 'object' && payload !== null) {
      const body = payload as {
        message?: string | string[];
        details?: ErrorDetail[];
        fields?: ErrorDetail[];
        error?: string;
      };

      // The ValidationPipe hands over an array with one message per invalid field.
      if (Array.isArray(body.message)) {
        details.push(...body.message.map((m) => ({ message: m })));
        message = 'Hay campos inválidos en la solicitud.';
      } else if (typeof body.message === 'string') {
        message = body.message;
      }

      // Details the service itself built per field (the password policy, for
      // instance). Without this they would be lost and the client would get
      // "does not meet the requirements" with no way to say WHICH.
      if (Array.isArray(body.details)) {
        details.push(...body.details);
      }

      // The same problems, each with its field (`FieldValidationPipe`): v2 only.
      if (Array.isArray(body.fields)) fields = body.fields;
    }

    return {
      status,
      code: AllExceptionsFilter.STATUS_CODES[status] ?? 'error',
      problem:
        fields !== undefined
          ? 'invalid_fields'
          : (STATUS_PROBLEM[status] ??
            (status >= FIRST_SERVER_ERROR ? 'internal_error' : 'bad_request')),
      message,
      details,
      errors: fields ?? details,
    };
  }

  private fromPrismaError(exception: Prisma.PrismaClientKnownRequestError): Normalized {
    switch (exception.code) {
      // Unique index violation
      case 'P2002':
        return plain(
          HttpStatus.CONFLICT,
          'duplicate',
          'duplicate',
          'Ya existe un registro con esos datos.',
        );
      // Foreign key violation (e.g. deleting an account with transactions)
      case 'P2003':
        return plain(
          HttpStatus.CONFLICT,
          'constraint_violation',
          'constraint_violation',
          'La operación rompería una relación existente.',
        );
      // Record not found. Someone else's resource lands here because of the
      // user_id scoping, and answering 404 (not 403) avoids confirming it exists.
      case 'P2025':
        return plain(HttpStatus.NOT_FOUND, 'not_found', 'not_found', 'El recurso no existe.');
      default:
        return plain(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'internal_error',
          'internal_error',
          'Ocurrió un error procesando la solicitud.',
        );
    }
  }
}

/** An error with no details, in both formats. */
function plain(status: number, code: string, problem: ProblemCode, message: string): Normalized {
  return { status, code, problem, message, details: [], errors: [] };
}

/** `instanceof` alone narrows to `DomainError<any>`. */
function isDomainError(exception: unknown): exception is DomainError {
  return exception instanceof DomainError;
}
