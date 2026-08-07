import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
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
 * Un 204 no lleva cuerpo: se deja pasar tal cual.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T> | T> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T> | T> {
    return next.handle().pipe(
      map((payload) => {
        if (payload === undefined || payload === null) {
          return payload as T;
        }
        if (hasEnvelope(payload)) {
          return payload as unknown as Envelope<T>;
        }
        return { data: payload, meta: {} };
      }),
    );
  }
}
