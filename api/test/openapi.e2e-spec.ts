import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';

import { startApp, type TestEnvironment } from './helpers/app';
import { AppModule } from '../src/app.module';
import { configureRouting } from '../src/bootstrap';
import { PROBLEM_TYPE_BASE } from '../src/common/errors/problem-codes';
import { SupabaseAuthService } from '../src/modules/auth/supabase-auth.service';
import { CONTRACT_VERSIONS, docsPath, setupApiDocs } from '../src/openapi/document';

/**
 * The committed contract (`api/openapi.v2.json`) against the app that runs.
 *
 * CI regenerates the document and fails if it differs from the committed
 * one, so the file is what the code describes. This suite closes the other gap:
 * what the code describes against what Express actually serves. A route added
 * without being documented — or documented and then removed — fails here, the
 * same way the guard at the end of `user-isolation.e2e-spec.ts` catches a
 * route nobody attacked.
 */

interface Operation {
  security?: Record<string, string[]>[];
}

interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
}

function readDocument(version: string): OpenApiDocument {
  return JSON.parse(
    readFileSync(join(__dirname, '..', `openapi.v${version}.json`), 'utf8'),
  ) as OpenApiDocument;
}

const DOCUMENTS = CONTRACT_VERSIONS.map((version) => ({
  version,
  document: readDocument(version),
}));

/** The `@Public()` routes: they answer without a token, so they carry no security. */
const PUBLIC = CONTRACT_VERSIONS.flatMap((version) => [
  `GET /api/v${version}/health`,
  `GET /api/v${version}/ready`,
  `POST /api/v${version}/auth/register`,
  `POST /api/v${version}/auth/login`,
  `POST /api/v${version}/auth/refresh`,
  `POST /api/v${version}/auth/logout`,
]);

/** `METHOD /path/{param}` for every operation the documents describe. */
function documentedOperations(): { route: string; operation: Operation }[] {
  return DOCUMENTS.flatMap(({ document }) => operationsOf(document));
}

function operationsOf(document: OpenApiDocument): { route: string; operation: Operation }[] {
  return Object.entries(document.paths).flatMap(([path, operations]) =>
    Object.entries(operations).map(([method, operation]) => ({
      route: `${method.toUpperCase()} ${path}`,
      operation,
    })),
  );
}

/** `METHOD /path/{param}` for every API route Express has registered. */
function registeredRoutes(app: INestApplication): string[] {
  interface Layer {
    route?: { path: string; methods: Record<string, boolean> };
  }
  const express = app.getHttpAdapter().getInstance() as {
    router?: { stack: Layer[] };
    _router?: { stack: Layer[] };
  };
  const stack = (express.router ?? express._router)?.stack ?? [];
  return stack
    .flatMap((layer) => {
      const route = layer.route;
      if (!route) return [];
      const path = route.path.replace(/:(\w+)/g, '{$1}');
      return Object.keys(route.methods).map((method) => `${method.toUpperCase()} ${path}`);
    })
    .filter((route) => route.includes('/api/') && !route.includes('*'));
}

describe('OpenAPI contract (api/openapi.v2.json)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await startApp();
  });

  afterAll(async () => {
    await env.close();
  });

  it('documents every registered route, and nothing that is not registered', () => {
    const registered = registeredRoutes(env.app);
    const documented = documentedOperations().map(({ route }) => route);

    expect(registered.length).toBeGreaterThan(50);
    expect(registered.filter((route) => !documented.includes(route))).toEqual([]);
    expect(documented.filter((route) => !registered.includes(route))).toEqual([]);
  });

  it('marks as unauthenticated exactly the public routes', () => {
    const open = documentedOperations()
      .filter(({ operation }) => (operation.security ?? []).length === 0)
      .map(({ route }) => route);

    expect(open.sort()).toEqual([...PUBLIC].sort());
  });

  it('every operation that declares the bearer token refuses a request without one', async () => {
    const secured = documentedOperations().filter(({ route }) => !PUBLIC.includes(route));

    for (const { route } of secured) {
      const [method, path] = route.split(' ') as [string, string];
      const url = path.replace(/\{\w+\}/g, '1');
      const response = await request(env.app.getHttpServer())[
        method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'
      ](url);

      expect({ route, status: response.status }).toEqual({ route, status: 401 });
      expect(response.body).toEqual({
        type: `${PROBLEM_TYPE_BASE}unauthenticated`,
        title: 'Hace falta iniciar sesión',
        status: 401,
        detail: expect.any(String),
        code: 'unauthenticated',
      });
    }
  });

  it('each document holds its own version and nothing else', () => {
    for (const { version, document } of DOCUMENTS) {
      const routes = operationsOf(document).map(({ route }) => route);
      expect(routes.filter((route) => !route.includes(`/api/v${version}/`))).toEqual([]);
    }
  });

  it('outside production, /api/docs/v<n> serves the same routes each file describes', async () => {
    // A second app, set up like main.ts does it: the docs routes go in BEFORE
    // init, which is when Nest closes the router with its 404 handler. It is
    // never initialised, so nothing connects and Supabase is not needed.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseAuthService)
      .useValue({})
      .compile();
    const app = moduleRef.createNestApplication();
    configureRouting(app);

    try {
      expect(setupApiDocs(app, 'test')).toBe(true);

      const server = app.getHttpServer();
      for (const { version, document } of DOCUMENTS) {
        const path = `/${docsPath(version)}`;
        await request(server).get(path).expect(200).expect('Content-Type', /html/);
        const served = await request(server).get(`${path}-json`).expect(200);

        // Paths only: under ts-jest the Swagger CLI plugin does not run, so the
        // schemas it infers from the DTOs are missing here and present in the file.
        expect(Object.keys((served.body as OpenApiDocument).paths).sort()).toEqual(
          Object.keys(document.paths).sort(),
        );
      }
    } finally {
      await app.close();
    }
  });
});
