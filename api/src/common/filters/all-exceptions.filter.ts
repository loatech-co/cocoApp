import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { checkViolationMessage } from './check-constraints';
import { DomainError, type DomainErrorKind, type ErrorDetail } from '../errors/domain-error';

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

/** Kinds whose `code` is not the generic one of their status. */
const DOMAIN_ERROR_CODE: Readonly<Partial<Record<DomainErrorKind, string>>> = {
  // The same code an unhandled P2002 gets below.
  duplicate: 'duplicate',
};

/**
 * Da forma única a TODOS los errores de la API.
 *
 * Dos audiencias, dos niveles de detalle:
 *   · Al cliente: `{ error: { code, message, details } }` con el status
 *     correcto. Nunca un stack trace ni SQL — filtrarlos le regala al atacante
 *     el mapa de la aplicación.
 *   · Al log del servidor: el detalle completo, para poder depurar.
 */

/** 500 as a plain number: `status` is a number, not the enum. */
const FIRST_SERVER_ERROR: number = HttpStatus.INTERNAL_SERVER_ERROR;
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

    const { status, code, message, details } = this.normalize(exception);

    // El log lleva user_id interno y ruta, nunca montos ni descripciones.
    const who = request.user ? `user=${request.user.id}` : 'anon';
    // Path only: the query string carries search terms and other personal data.
    const line = `${request.method} ${request.url.split('?')[0]} → ${status} [${code}] ${who}`;

    if (status >= FIRST_SERVER_ERROR) {
      this.logger.error(line, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(line);
    }

    response.status(status).json({ error: { code, message, details } });
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details: ErrorDetail[];
  } {
    if (exception instanceof DomainError) {
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
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'unprocessable',
          message,
          details: [],
        };
      }
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // Forma de datos inválida que llegó hasta Prisma: es un bug nuestro, no
      // del cliente. Se registra como 500 sin revelar el detalle del esquema.
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'internal_error',
        message: 'Ocurrió un error procesando la solicitud.',
        details: [],
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
      message: 'Ocurrió un error inesperado. Intenta de nuevo.',
      details: [],
    };
  }

  /**
   * A domain error goes out exactly as the Nest exception it replaced did:
   * same status, same `code` (from the same table), same message, and the
   * details it carries.
   */
  private fromDomainError(exception: DomainError): {
    status: number;
    code: string;
    message: string;
    details: ErrorDetail[];
  } {
    const status = DOMAIN_ERROR_STATUS[exception.kind];
    return {
      status,
      code:
        DOMAIN_ERROR_CODE[exception.kind] ?? AllExceptionsFilter.STATUS_CODES[status] ?? 'error',
      message: exception.message,
      details: [...exception.details],
    };
  }

  private fromHttpException(exception: HttpException): {
    status: number;
    code: string;
    message: string;
    details: ErrorDetail[];
  } {
    const status = exception.getStatus();
    // `unknown`: el tipo dice `string | object`, pero una excepción construida
    // a mano puede traer cualquier cosa, null incluido.
    const payload: unknown = exception.getResponse();
    const details: ErrorDetail[] = [];
    let message = exception.message;

    if (typeof payload === 'object' && payload !== null) {
      const body = payload as {
        message?: string | string[];
        details?: ErrorDetail[];
        error?: string;
      };

      // El ValidationPipe entrega un array con un mensaje por campo inválido.
      if (Array.isArray(body.message)) {
        details.push(...body.message.map((m) => ({ message: m })));
        message = 'Hay campos inválidos en la solicitud.';
      } else if (typeof body.message === 'string') {
        message = body.message;
      }

      // Detalles que el propio servicio armó por campo (la política de
      // contraseñas, por ejemplo). Sin esto se perderían y el cliente recibiría
      // "no cumple los requisitos" sin poder decir CUÁL.
      if (Array.isArray(body.details)) {
        details.push(...body.details);
      }
    }

    return {
      status,
      code: AllExceptionsFilter.STATUS_CODES[status] ?? 'error',
      message,
      details,
    };
  }

  private fromPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
    details: ErrorDetail[];
  } {
    switch (exception.code) {
      // Violación de índice único
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'duplicate',
          message: 'Ya existe un registro con esos datos.',
          details: [],
        };
      // Violación de clave foránea (p. ej. borrar una cuenta con movimientos)
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: 'constraint_violation',
          message: 'La operación rompería una relación existente.',
          details: [],
        };
      // Registro no encontrado. Un recurso ajeno cae aquí por el scoping por
      // user_id, y devolver 404 (no 403) evita confirmar que existe.
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'not_found',
          message: 'El recurso no existe.',
          details: [],
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'internal_error',
          message: 'Ocurrió un error procesando la solicitud.',
          details: [],
        };
    }
  }
}
