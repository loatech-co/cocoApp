import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { API_PREFIX } from '../bootstrap';
import { BEARER_SCHEME } from '../contract/v1/openapi.decorators';

/** Where Swagger UI is served, outside production only. */
export const DOCS_PATH = 'api/docs';

/**
 * The OpenAPI document of the API, built from the controllers and DTOs.
 *
 * One function for the two places that need it: `main.ts`, to serve Swagger
 * UI, and `generate.ts`, to write `api/openapi.json` without a database. The
 * committed file and what the server describes cannot drift apart because
 * they are the same call.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Coco API')
    .setDescription(
      [
        `Contract v1, served under \`/${API_PREFIX}\`.`,
        '',
        'Every successful JSON response is wrapped as `{ data, meta }`. Every error is',
        '`{ error: { code, message, details } }`, where `details` lists the fields that failed.',
        '',
        'Identifiers are integers (int64) and money travels as a decimal string.',
      ].join('\n'),
    )
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_SCHEME)
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
  });
}

/**
 * Serves Swagger UI at `/api/docs` unless the process runs in production.
 *
 * Returns whether it did, so the caller can log it and a test can pin the
 * production case.
 */
export function setupApiDocs(app: INestApplication, nodeEnv: string | undefined): boolean {
  if (nodeEnv === 'production') return false;
  SwaggerModule.setup(DOCS_PATH, app, () => createOpenApiDocument(app));
  return true;
}
