import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

import type { TestEnvironment } from './helpers/app';

/**
 * The process serves the SPA too, and its fallback answers any unknown path
 * with index.html. That is right for a page reload and wrong for everything
 * else: `/problems/not_found` and `/openapi.v2.json` used to say "200, here is
 * HTML", and a missing bundle loaded HTML as JavaScript.
 *
 * `SpaModule.forRoot()` reads `SPA_DIST_PATH` when the app module is first
 * loaded, so the module is imported only after pointing it at a fake build.
 */
describe('SPA fallback and the headers of every response (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let dist: string;
  let previous: string | undefined;

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'coco-spa-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'export {};');
    previous = process.env.SPA_DIST_PATH;
    process.env.SPA_DIST_PATH = dist;

    const { startApp } = await import('./helpers/app');
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
    rmSync(dist, { recursive: true, force: true });
    if (previous === undefined) delete process.env.SPA_DIST_PATH;
    else process.env.SPA_DIST_PATH = previous;
  });

  it('serves index.html for a page the router resolves', async () => {
    const response = await http.get('/movimientos').expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.headers['cache-control']).toBe('no-cache, must-revalidate');
  });

  it('serves a real asset', async () => {
    const response = await http.get('/assets/app-abc123.js').expect(200);

    expect(response.headers['content-type']).toMatch(/javascript/);
  });

  it.each([
    '/problems/not_found',
    '/problems',
    '/openapi.v2.json',
    '/assets/missing-000.js',
    '/api/v2/nope',
  ])('answers %s with a 404 problem document, never the SPA', async (path) => {
    const response = await http.get(path).expect(404);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('sends exactly one content security policy and a permissions policy', async () => {
    const { PERMISSIONS_POLICY } = await import('../src/bootstrap');

    for (const path of ['/movimientos', '/api/v2/health', '/problems/not_found']) {
      const response = await http.get(path);
      const raw: string[] = (response as unknown as { res: { rawHeaders: string[] } }).res
        .rawHeaders;
      const names = raw
        .filter((_value, index) => index % 2 === 0)
        .map((name) => name.toLowerCase());

      expect(names.filter((name) => name === 'content-security-policy')).toHaveLength(1);
      expect(response.headers['permissions-policy']).toBe(PERMISSIONS_POLICY);
    }
  });
});
