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

/** How each version answers, the errors included: v2's are RFC 9457. */
const ENVELOPES: Readonly<Record<ContractVersion, string>> = {
  '1': [
    'Every successful JSON response is wrapped as `{ data, meta }`. Every error is',
    '`{ error: { code, message, details } }`, where `details` lists the fields that failed.',
  ].join('\n'),
  '2': [
    'Every successful JSON response is wrapped as `{ data, meta }`. Every error is',
    '`application/problem+json` (RFC 9457): `{ type, title, status, detail, code, errors? }`.',
    'Switch on `code`: stable, in English, one per business rule. `errors` lists the fields',
    'that failed.',
  ].join('\n'),
};

const COMMON = [
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
  const id = `${resource}_${methodKey}`;
  return V1_PUBLISHED_IDS[id] ?? id;
}

/**
 * The v1 ids that were published with a Spanish method name. Step 7.2 put
 * the controller methods in English; the published contract keeps its ids,
 * so a renamed v1 method is listed here with the id it already had. The
 * table goes with v1 (7.10).
 */
const V1_PUBLISHED_IDS: Readonly<Record<string, string>> = {
  AuthController_register: 'AuthController_registrar',
  AuthController_login: 'AuthController_entrar',
  AuthController_refresh: 'AuthController_refrescar',
  AuthController_logout: 'AuthController_salir',
  AuthController_logoutAll: 'AuthController_salirDeTodo',
  AuthController_me: 'AuthController_perfil',
  AuthController_changePassword: 'AuthController_cambiarContrasena',
  AccountsController_list: 'AccountsController_listar',
  AccountsController_get: 'AccountsController_obtener',
  AccountsController_create: 'AccountsController_crear',
  AccountsController_update: 'AccountsController_actualizar',
  AccountsController_remove: 'AccountsController_eliminar',
  TagsController_list: 'TagsController_listar',
  TagsController_create: 'TagsController_crear',
  TagsController_update: 'TagsController_actualizar',
  TagsController_remove: 'TagsController_eliminar',
  AdminController_list: 'AdminController_listar',
  AdminController_approve: 'AdminController_aprobar',
  AdminController_suspend: 'AdminController_suspender',
  AdminController_reactivate: 'AdminController_reactivar',
  AdminController_changeRole: 'AdminController_cambiarRol',
  AdminController_resetPassword: 'AdminController_restablecer',
  AdminController_auditLog: 'AdminController_bitacora',
  PreferencesController_read: 'PreferencesController_leer',
  PreferencesController_update: 'PreferencesController_actualizar',
  CategoriesController_list: 'CategoriesController_listar',
  CategoriesController_get: 'CategoriesController_obtener',
  CategoriesController_create: 'CategoriesController_crear',
  CategoriesController_seed: 'CategoriesController_sembrar',
  CategoriesController_reorder: 'CategoriesController_reordenar',
  CategoriesController_merge: 'CategoriesController_unificar',
  CategoriesController_update: 'CategoriesController_actualizar',
  CategoriesController_usage: 'CategoriesController_usos',
  CategoriesController_remove: 'CategoriesController_eliminar',
  CategorizationController_suggest: 'CategorizationController_sugerir',
  CategorizationController_learn: 'CategorizationController_aprender',
  TransactionsController_list: 'TransactionsController_listar',
  TransactionsController_history: 'TransactionsController_historia',
  TransactionsController_createTransfer: 'TransactionsController_crearTransferencia',
  TransactionsController_get: 'TransactionsController_obtener',
  TransactionsController_create: 'TransactionsController_crear',
  TransactionsController_update: 'TransactionsController_actualizar',
  TransactionsController_remove: 'TransactionsController_eliminar',
  DashboardController_get: 'DashboardController_resumen',
};

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
    .setDescription(`${DESCRIPTION[version]}\n\n${ENVELOPES[version]}\n${COMMON}`)
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
