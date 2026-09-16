import {
  Injectable,
  StreamableFile,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

/** Marca de que el handler ya armó su propio `meta` (paginación, totales…). */
function hasEnvelope(value: unknown): value is Envelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value
  );
}

/**
 * Envuelve toda respuesta exitosa en `{ data, meta }`.
 *
 * Los controladores devuelven el recurso "desnudo" y no repiten el envoltorio;
 * cuando necesitan poblar `meta` (paginación, por ejemplo) devuelven ya
 * `{ data, meta }` y el interceptor lo respeta.
 *
 * Un 204 no lleva cuerpo: se deja pasar tal cual. Un `StreamableFile` tampoco
 * se toca: es un binario, no un recurso.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T> | T> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T> | T> {
    return next.handle().pipe(
      map((payload) => {
        if (payload === undefined || payload === null) {
          return payload;
        }
        if (hasEnvelope(payload)) {
          return payload;
        }
        // Un archivo se entrega tal cual. Envuelto en `{ data, meta }` deja de
        // ser un flujo y pasa a ser un objeto vacío serializado a JSON: el
        // navegador recibe `{"data":{},"meta":{}}` con el content-type de un
        // PDF y no enseña nada, sin ningún error que lo explique.
        if (payload instanceof StreamableFile) {
          return payload;
        }
        return { data: payload, meta: {} };
      }),
    );
  }
}
