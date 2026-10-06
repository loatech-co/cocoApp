import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { PageMetaV2 } from './envelope.response';
import { Problem, ProblemFieldError } from './problem.response';
import { PROBLEMS } from '../../common/errors/problem-codes';
import { PROBLEM_JSON } from '../../common/filters/all-exceptions.filter';

/** Name of the bearer scheme every authenticated operation requires. */
export const BEARER_SCHEME = 'bearer';

interface DataOptions {
  /** 200 unless the route answers otherwise (a POST without `@HttpCode` is 201). */
  status?: number;
  /** `data` is one page of `model`, and `meta` says which (D9). */
  isPage?: boolean;
  /** A page whose `meta` carries more than the page (it extends `PageMetaV2`). */
  pageMeta?: Type<PageMetaV2>;
  /** `data` may be `null`. */
  nullable?: boolean;
  description?: string;
}

/**
 * A v2 success inside the `{ data, meta }` envelope. Every list is a page
 * (`PageMetaV2`, in camelCase).
 *
 * The errors are `application/problem+json` (`ApiErrors` below).
 */
export function ApiDataV2(model: Type<unknown>, options: DataOptions = {}): MethodDecorator {
  const item = { $ref: getSchemaPath(model) };
  const data = options.isPage
    ? { type: 'array', items: item }
    : options.nullable
      ? { allOf: [item], nullable: true }
      : item;
  const pageMeta = options.pageMeta ?? PageMetaV2;
  const meta = options.isPage
    ? { $ref: getSchemaPath(pageMeta) }
    : { type: 'object', properties: {}, maxProperties: 0 };

  return applyDecorators(
    ApiExtraModels(model, ...(options.isPage ? [pageMeta] : [])),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description ?? 'Success.',
      schema: { type: 'object', required: ['data', 'meta'], properties: { data, meta } },
    }),
  );
}

/** A 204: nothing in the body. */
export function ApiNoContent(): MethodDecorator {
  return ApiNoContentResponse({ description: 'Done. No body.' });
}

const STATUS_DESCRIPTION: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'The input is invalid; `errors` names each field at fault.',
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

/** The codes a status can carry, for the document: what a client may switch on. */
function codesOf(status: number): string {
  const codes = Object.entries(PROBLEMS)
    .filter(([, problem]) => problem.status === status)
    .map(([code]) => `\`${code}\``);
  return codes.length > 0 ? ` Codes: ${codes.join(', ')}.` : '';
}

/** v2 error responses: `application/problem+json`, with the codes each status can carry. */
export function ApiErrors(...statuses: number[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(Problem, ProblemFieldError),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: (STATUS_DESCRIPTION[status] ?? 'Error.') + codesOf(status),
        content: { [PROBLEM_JSON]: { schema: { $ref: getSchemaPath(Problem) } } },
      }),
    ),
  );
}

/** Needs `Authorization: Bearer <access token>`; the errors any such route can give. */
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

/** Open to anyone; the errors any route can give. */
export function ApiPublic(): MethodDecorator & ClassDecorator {
  return ApiErrors(HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR);
}
