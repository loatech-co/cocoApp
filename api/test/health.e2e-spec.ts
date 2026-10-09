import request from 'supertest';

import { startApp, type TestEnvironment } from './helpers/app';
import { HealthRepository } from '../src/modules/health/health.repository';

/**
 * Phase 0 — the whole chain against a real Postgres (a `_test` database).
 *
 * Nothing on the authentication path is faked here: the access tokens are
 * JWTs signed by the same TokenService the login uses, and the global guard
 * verifies them and queries the database just as in production.
 */
describe('Fase 0 — the auth guard on a protected route, and the public probes (e2e)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await startApp();
  });

  afterAll(async () => {
    await env.close();
  });

  afterEach(async () => {
    await env.clean();
  });

  it('without an Authorization header it answers 401 with the canonical envelope', async () => {
    const response = await request(env.app.getHttpServer()).get('/api/v2/auth/me').expect(401);

    expect(response.body).toMatchObject({
      status: 401,
      code: 'unauthenticated',
      detail: expect.any(String),
    });
    // And it never leaks an internal detail.
    expect(JSON.stringify(response.body)).not.toMatch(/stack|at Object|\.ts:/i);
  });

  it('with a token that is not a JWT it answers 401', async () => {
    await request(env.app.getHttpServer())
      .get('/api/v2/auth/me')
      .set('Authorization', 'Bearer esto-no-es-un-token')
      .expect(401);
  });

  // SIGNATURE VERIFICATION belongs to Supabase: the API checks the token
  // against the project's JWKS with `jose`, and here Supabase is replaced by a
  // double. Testing the signature in this harness would be testing the double,
  // not the system. What is tested is what this application decides: whom
  // that token identifies and until when it is accepted.

  it('a token for an account with no profile here answers 401', async () => {
    // It exists in Supabase but nobody registered it in the app: without a
    // profile there is no role or status, so there is nothing to authorise.
    const orphan = env.supabase.seed('sin-perfil@pruebas.coco', 'Loquesea-123!');
    const token = env.supabase.issueToken(orphan);

    await request(env.app.getHttpServer())
      .get('/api/v2/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('a token issued BEFORE the session was revoked answers 401', async () => {
    const user = await env.createUser();

    // A token from an hour ago, with a flawless signature. What kills it is the
    // revocation mark, which the guard compares on every request.
    const old = env.supabase.issueToken(user.authId!, new Date(Date.now() - 60 * 60 * 1000));
    await env.prisma.user.update({
      where: { id: user.id },
      data: { sessionsValidFrom: new Date() },
    });

    await request(env.app.getHttpServer())
      .get('/api/v2/auth/me')
      .set('Authorization', `Bearer ${old}`)
      .expect(401);
  });

  it('with a token of a user that no longer exists it answers 401', async () => {
    const user = await env.createUser();
    const header = env.as(user);

    await env.prisma.auditLog.deleteMany({});
    await env.prisma.user.delete({ where: { id: user.id } });

    await request(env.app.getHttpServer())
      .get('/api/v2/auth/me')
      .set('Authorization', header)
      .expect(401);
  });

  it('a valid token reaches a protected route as THAT user', async () => {
    const user = await env.createUser();

    const response = await request(env.app.getHttpServer())
      .get('/api/v2/auth/me')
      .set('Authorization', env.as(user))
      .expect(200);

    expect(JSON.stringify(response.body)).toContain(user.email);
  });

  it('health is public: 200 without a token, says only that it is alive and which commit', async () => {
    const response = await request(env.app.getHttpServer()).get('/api/v2/health').expect(200);

    // Exactly these two keys: the short SHA and nothing more about the deploy.
    expect(response.body).toEqual({
      data: { status: 'ok', version: expect.stringMatching(/^([0-9a-f]{7}|unknown)$/) },
      meta: {},
    });
  });

  it('ready is public: 200 without a token once the database answers', async () => {
    const response = await request(env.app.getHttpServer()).get('/api/v2/ready').expect(200);

    expect(response.body).toEqual({ data: { status: 'ok', db: 'ok' }, meta: {} });
  });

  it('ready answers 503 when the database does not, and health stays 200', async () => {
    const repository = env.app.get(HealthRepository);
    const ping = jest.spyOn(repository, 'isDatabaseReachable').mockResolvedValue(false);

    try {
      const response = await request(env.app.getHttpServer()).get('/api/v2/ready').expect(503);
      expect(response.body).toMatchObject({
        status: 503,
        code: 'database_unavailable',
        detail: 'La base de datos no responde.',
      });
      // The process is still alive: an unreachable database is not a crash.
      await request(env.app.getHttpServer()).get('/api/v2/health').expect(200);
    } finally {
      ping.mockRestore();
    }
  });

  it('every response carries an X-Request-Id', async () => {
    const response = await request(env.app.getHttpServer()).get('/api/v2/health').expect(200);

    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
  });
});
