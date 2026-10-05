import { ConfigService } from '@nestjs/config';
import request from 'supertest';

import { levantarApp, type EntornoDePruebas } from './helpers/app';
import { parseOrigins } from '../src/bootstrap';

/**
 * Step 7.11: the security headers and the CORS policy, on the app exactly as
 * `configureApp` builds it in production (CONTRIBUTING, "Security").
 *
 * The rate limits have their own file (`rate-limit.e2e-spec.ts`) because the
 * rest of the suite switches the limiter off.
 */
describe('Security headers and CORS (e2e)', () => {
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let allowed: string;

  /** Same scheme and host family as the allowed one, and still not on the list. */
  const REJECTED = 'https://evil.example';

  beforeAll(async () => {
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
    const origins = parseOrigins(entorno.app.get(ConfigService));
    // The test environment must declare at least one origin, or there is
    // nothing to prove: an empty list rejects everyone.
    expect(origins.length).toBeGreaterThan(0);
    allowed = origins[0]!;
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('sends the helmet headers on every response', async () => {
    const response = await http.get('/api/v1/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    // Express announces itself unless someone removes the header.
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sends a content security policy that allows only what the app needs', async () => {
    const csp = (await http.get('/api/v1/health').expect(200)).headers['content-security-policy'];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    // `wasm-unsafe-eval` is the narrow permit Tesseract needs; full eval never.
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('answers a preflight from an allowed origin with that exact origin and credentials', async () => {
    const response = await http
      .options('/api/v1/auth/login')
      .set('Origin', allowed)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(response.status).toBeLessThan(300);
    expect(response.headers['access-control-allow-origin']).toBe(allowed);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toBe(
      'Authorization,Content-Type,Idempotency-Key',
    );
  });

  it('gives a foreign origin no CORS permission at all', async () => {
    const preflight = await http
      .options('/api/v1/auth/login')
      .set('Origin', REJECTED)
      .set('Access-Control-Request-Method', 'POST');
    const simple = await http.get('/api/v1/health').set('Origin', REJECTED).expect(200);

    // Without the header the browser blocks the response; never a wildcard.
    for (const response of [preflight, simple]) {
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
  });
});
