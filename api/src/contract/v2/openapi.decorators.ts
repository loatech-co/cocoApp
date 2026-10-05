import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { PageMetaV2 } from './envelope.response';

interface DataOptions {
  /** 200 unless the route answers otherwise (a POST without `@HttpCode` is 201). */
  status?: number;
  /** `data` is one page of `model`, and `meta` says which (D9). */
  isPage?: boolean;
  /** `data` may be `null`. */
  nullable?: boolean;
  description?: string;
}

/**
 * A v2 success inside the `{ data, meta }` envelope. The same envelope as v1;
 * what changes is that every list is a page (`PageMetaV2`, in camelCase).
 *
 * The error, auth and no-content decorators are the v1 ones: those shapes did
 * not change between versions.
 */
export function ApiDataV2(model: Type<unknown>, options: DataOptions = {}): MethodDecorator {
  const item = { $ref: getSchemaPath(model) };
  const data = options.isPage
    ? { type: 'array', items: item }
    : options.nullable
      ? { allOf: [item], nullable: true }
      : item;
  const meta = options.isPage
    ? { $ref: getSchemaPath(PageMetaV2) }
    : { type: 'object', properties: {}, maxProperties: 0 };

  return applyDecorators(
    ApiExtraModels(model, ...(options.isPage ? [PageMetaV2] : [])),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description ?? 'Success.',
      schema: { type: 'object', required: ['data', 'meta'], properties: { data, meta } },
    }),
  );
}
