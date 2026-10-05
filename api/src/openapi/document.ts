import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { BEARER_SCHEME } from '../contract/v1/openapi.decorators';

/** The contract versions the API serves, each with its own document. */
export const CONTRACT_VERSIONS = ['1', '2'] as const;
export type ContractVersion = (typeof CONTRACT_VERSIONS)[number];

/** Where Swagger UI serves each version, outside production only. */
export function docsPath(version: ContractVersion): string {
  return `api/docs/v${version}`;
}

const DESCRIPTION: Readonly<Record<ContractVersion, string>> = {
  '1': [
    'Contract v1, served under `/api/v1`. **Deprecated** since 2026-10-05: every response',
    'carries `Deprecation` (RFC 9745) and a `Link` to its v2 successor. It is removed after',
    'seven days without uses (step 7.10).',
  ].join('\n'),
  '2': [
    'Contract v2, served under `/api/v2`: the v1 API in English and camelCase, with every',
    'list paginated as `{ data, meta: { page, perPage, total } }`.',
  ].join('\n'),
};

const COMMON = [
  '',
  'Every successful JSON response is wrapped as `{ data, meta }`. Every error is',
  '`{ error: { code, message, details } }`, where `details` lists the fields that failed.',
  'Messages meant for the user are in Spanish.',
  '',
  'Identifiers are integers (int64) and money travels as a decimal string.',
].join('\n');

/**
 * The operation id a client generator turns into a function name. v1 keeps
 * the ids it was published with; v2 drops the `V2Controller` suffix, so the
 * web gets `Transactions_list` and not `TransactionsV2Controller_list`.
 */
function operationId(controllerKey: string, methodKey: string): string {
  const resource = controllerKey.endsWith('V2Controller')
    ? controllerKey.slice(0, -'V2Controller'.length)
    : controllerKey;
  return `${resource}_${methodKey}`;
}

/** Every `$ref` reachable from `value`, followed through `schemas`. */
function reachableSchemas(value: unknown, schemas: Record<string, unknown>): Set<string> {
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, inner] of Object.entries(node)) {
      if (key === '$ref' && typeof inner === 'string') {
        const name = inner.replace('#/components/schemas/', '');
        if (!found.has(name)) {
          found.add(name);
          visit(schemas[name]);
        }
      } else {
        visit(inner);
      }
    }
  };
  visit(value);
  return found;
}

/**
 * The OpenAPI document of ONE contract version, built from the controllers
 * and DTOs.
 *
 * Nest describes every route at once, so the document is cut afterwards:
 * the paths of the version, and only the schemas those paths reach. One
 * function for the two places that need it: `main.ts`, to serve Swagger UI,
 * and `generate.ts`, to write `api/openapi.v<n>.json` without a database.
 */
export function createOpenApiDocument(
  app: INestApplication,
  version: ContractVersion,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Coco API')
    .setDescription(`${DESCRIPTION[version]}\n${COMMON}`)
    .setVersion(version)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_SCHEME)
    .build();

  const whole = SwaggerModule.createDocument(app, config, { operationIdFactory: operationId });
  const prefix = `/api/v${version}/`;
  const paths = Object.fromEntries(
    Object.entries(whole.paths).filter(([path]) => path.startsWith(prefix)),
  );
  const schemas = whole.components?.schemas ?? {};
  const used = reachableSchemas(paths, schemas);

  return {
    ...whole,
    paths,
    components: {
      ...whole.components,
      schemas: Object.fromEntries(Object.entries(schemas).filter(([name]) => used.has(name))),
    },
  };
}

/**
 * Serves Swagger UI for each version at `/api/docs/v<n>` unless the process
 * runs in production.
 *
 * Returns whether it did, so the caller can log it and a test can pin the
 * production case.
 */
export function setupApiDocs(app: INestApplication, nodeEnv: string | undefined): boolean {
  if (nodeEnv === 'production') return false;
  for (const version of CONTRACT_VERSIONS) {
    SwaggerModule.setup(docsPath(version), app, () => createOpenApiDocument(app, version));
  }
  return true;
}
