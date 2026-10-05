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

interface ErrorDetail {
  field?: string;
  message: string;
}

/**
 * Da forma única a TODOS los errores de la API.
 *
 * Dos audiencias, dos niveles de detalle:
 *   · Al cliente: `{ error: { code, message, details } }` con el status
 *     correcto. Nunca un stack trace ni SQL — filtrarlos le regala al atacante
 *     el mapa de la aplicación.
 *   · Al log del servidor: el detalle completo, para poder depurar.
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

    const { status, code, message, details } = this.normalize(exception);

    // El log lleva user_id interno y ruta, nunca montos ni descripciones.
    const who = request.user ? `user=${request.user.id}` : 'anon';
    // Path only: the query string carries search terms and other personal data.
    const line = `${request.method} ${request.url.split('?')[0]} → ${status} [${code}] ${who}`;

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
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

  private fromHttpException(exception: HttpException): {
    status: number;
    code: string;
    message: string;
    details: ErrorDetail[];
  } {
    const status = exception.getStatus();
    const payload = exception.getResponse();
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
