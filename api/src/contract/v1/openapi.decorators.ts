import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { ErrorResponse, PageMeta, TotalMeta } from './envelope.response';

/** Name of the bearer scheme every authenticated operation requires. */
export const BEARER_SCHEME = 'bearer';

/** `meta` of a single resource is always an empty object; a list says how it was cut. */
const META = { empty: null, total: TotalMeta, page: PageMeta } as const;

interface DataOptions {
  /** 200 unless the route answers otherwise (a POST without `@HttpCode` is 201). */
  status?: number;
  /** `data` is an array of `model`. */
  isArray?: boolean;
  /** `data` may be `null`. */
  nullable?: boolean;
  /** What `meta` carries: `{}` unless said otherwise. */
  meta?: keyof typeof META;
  description?: string;
}

/**
 * A success, described inside the `{ data, meta }` envelope that
 * `TransformInterceptor` adds — so the schema is what the client receives,
 * not what the controller returns.
 */
export function ApiData(model: Type<unknown>, options: DataOptions = {}): MethodDecorator {
  const metaModel = META[options.meta ?? 'empty'];
  const meta =
    metaModel === null
      ? { type: 'object', properties: {}, maxProperties: 0 }
      : { $ref: getSchemaPath(metaModel) };
  const item = { $ref: getSchemaPath(model) };
  const data = options.isArray
    ? { type: 'array', items: item }
    : options.nullable
      ? { allOf: [item], nullable: true }
      : item;

  return applyDecorators(
    ApiExtraModels(model, ...(metaModel === null ? [] : [metaModel])),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description ?? 'Success.',
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: { data, meta },
      },
    }),
  );
}

/** A success with no body (204). */
export function ApiNoContent(): MethodDecorator {
  return ApiNoContentResponse({ description: 'Done. No body.' });
}

const ERROR_DESCRIPTION: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'The input is invalid; `details` names each field at fault.',
  [HttpStatus.UNAUTHORIZED]: 'No valid access token (or session to renew).',
  [HttpStatus.FORBIDDEN]: 'The user may not do this.',
  [HttpStatus.NOT_FOUND]: 'Not found, or not owned by this user.',
  [HttpStatus.CONFLICT]: 'Conflicts with the current state (a duplicate, a resource in use).',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'A file is over the size limit.',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'A file type the API does not accept.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Well-formed but breaks a business rule.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Rate limit reached; retry later.',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Unexpected failure.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'A dependency (the database) does not answer.',
};

/** Failures, each as `{ error: { code, message, details } }`. */
export function ApiErrors(...statuses: number[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(ErrorResponse),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTION[status] ?? 'Error.',
        type: ErrorResponse,
      }),
    ),
  );
}

/**
 * Every route behind the global `JwtAuthGuard`: bearer token, and the
 * failures any route can give (no session, rate limit, unexpected).
 */
export function ApiAuthenticated(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiBearerAuth(BEARER_SCHEME),
    ApiErrors(
      HttpStatus.UNAUTHORIZED,
      HttpStatus.TOO_MANY_REQUESTS,
      HttpStatus.INTERNAL_SERVER_ERROR,
    ),
  );
}

/** A `@Public()` route: no token, but still rate-limited. */
export function ApiPublic(): MethodDecorator & ClassDecorator {
  return ApiErrors(HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR);
}
