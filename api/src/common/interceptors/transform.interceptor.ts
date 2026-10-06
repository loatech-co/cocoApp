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

/** Says the handler already built its own `meta` (pagination, totals…). */
function hasEnvelope(value: unknown): value is Envelope<unknown> {
  return typeof value === 'object' && value !== null && 'data' in value && 'meta' in value;
}

/**
 * Wraps every successful response in `{ data, meta }`.
 *
 * Controllers return the "bare" resource and do not repeat the envelope; when
 * they need to fill `meta` (pagination, for instance) they already return
 * `{ data, meta }` and the interceptor respects it.
 *
 * A 204 has no body: it goes through as it is. A `StreamableFile` is not
 * touched either: it is a binary, not a resource.
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
        // A file is handed over as it is. Wrapped in `{ data, meta }` it stops
        // being a stream and becomes an empty object serialised to JSON: the
        // browser gets `{"data":{},"meta":{}}` with a PDF's content type and
        // shows nothing, with no error to explain it.
        if (payload instanceof StreamableFile) {
          return payload;
        }
        return { data: payload, meta: {} };
      }),
    );
  }
}
