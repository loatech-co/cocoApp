import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';

import { levantarApp, type EntornoDePruebas } from './helpers/app';
import { AppModule } from '../src/app.module';
import { API_PREFIX } from '../src/bootstrap';
import { SupabaseAuthService } from '../src/modules/auth/supabase-auth.service';
import { setupApiDocs } from '../src/openapi/document';

/**
 * The committed contract (`api/openapi.json`) against the app that runs.
 *
 * CI regenerates the document and fails if it differs from the committed one,
 * so the file is what the code describes. This suite closes the other gap:
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

const DOCUMENT = JSON.parse(
  readFileSync(join(__dirname, '..', 'openapi.json'), 'utf8'),
) as OpenApiDocument;

/** The `@Public()` routes: they answer without a token, so they carry no security. */
const PUBLIC = [
  'GET /api/v1/health',
  'GET /api/v1/ready',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
];

/** `METHOD /path/{param}` for every operation the document describes. */
function documentedOperations(): { route: string; operation: Operation }[] {
  return Object.entries(DOCUMENT.paths).flatMap(([path, operations]) =>
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

describe('OpenAPI contract (api/openapi.json)', () => {
  let env: EntornoDePruebas;

  beforeAll(async () => {
    env = await levantarApp();
  });

  afterAll(async () => {
    await env.cerrar();
  });

  it('documents every registered route, and nothing that is not registered', () => {
    const registered = registeredRoutes(env.app);
    const documented = documentedOperations().map(({ route }) => route);

    expect(registered.length).toBeGreaterThan(40);
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
        error: { code: 'unauthenticated', message: expect.any(String), details: [] },
      });
    }
  });

  it('outside production, /api/docs serves the same routes the file describes', async () => {
    // A second app, set up like main.ts does it: the docs routes go in BEFORE
    // init, which is when Nest closes the router with its 404 handler. It is
    // never initialised, so nothing connects and Supabase is not needed.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseAuthService)
      .useValue({})
      .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);

    try {
      expect(setupApiDocs(app, 'test')).toBe(true);

      const server = app.getHttpServer();
      await request(server).get('/api/docs').expect(200).expect('Content-Type', /html/);
      const served = await request(server).get('/api/docs-json').expect(200);

      // Paths only: under ts-jest the Swagger CLI plugin does not run, so the
      // schemas it infers from the DTOs are missing here and present in the file.
      expect(Object.keys((served.body as OpenApiDocument).paths).sort()).toEqual(
        Object.keys(DOCUMENT.paths).sort(),
      );
    } finally {
      await app.close();
    }
  });
});
