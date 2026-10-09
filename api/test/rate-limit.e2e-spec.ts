import request from 'supertest';

import { VALID_PASSWORD, testEmail, startApp, type TestEnvironment } from './helpers/app';

/**
 * The rate limiter, really switched on.
 *
 * It lives in its own file because the rest of the suite switches it off: it
 * counts attempts per minute and would fail tests for reasons unrelated to
 * what they check. Here it is checked that it is still alive, which is what
 * matters — without this test, someone could switch it off by accident and
 * nobody would notice.
 *
 * Why it matters: sign-up and login spend a 19 MiB argon2 hash per attempt.
 * With no cap, a few requests per second are enough to leave the API out of
 * memory.
 */
describe('Rate limiter (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  // A fresh app, and with it a fresh limiter, for every test: the counters
  // live in memory for a minute, so with one app per file the 429 of one test
  // depended on the attempts another one had already spent.
  beforeEach(async () => {
    env = await startApp({ withRateLimiter: true });
    http = request(env.app.getHttpServer());
  });

  afterEach(async () => {
    await env.close();
  });

  it('cuts login off at the eleventh attempt in a minute', async () => {
    const user = await env.createUser();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await http
        .post('/api/v2/auth/login')
        .send({ email: user.email, password: 'Zz9$Otra-Cosa-Aqui!' });
      statuses.push(response.status);
    }

    // The first ten reach the service (401: wrong credentials).
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    // The eleventh does not even try.
    expect(statuses[10]).toBe(429);
  });

  it('behind the proxy each client has its quota, and each email its own', async () => {
    // LiteSpeed appends the address it saw; documentation-range IPs stand in.
    const user = await env.createUser();
    const other = await env.createUser();
    const login = (email: string, ip: string) =>
      http
        .post('/api/v2/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email, password: 'Zz9$Otra-Cosa-Aqui!' });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await login(user.email, '203.0.113.1').expect(401);
    }

    // Another client is not blocked by the first one's failures: before
    // `trust proxy`, every request came from LiteSpeed and this was a 429.
    await login(other.email, '203.0.113.2').expect(401);

    // The same account from a fresh address: the per-email limit holds,
    // whatever the case the address is written in.
    await login(user.email, '203.0.113.3').expect(429);
    await http
      .post('/api/v2/auth/login')
      .set('X-Forwarded-For', '203.0.113.4')
      .send({ email: user.email.toUpperCase(), password: 'Zz9$Otra-Cosa-Aqui!' })
      .expect(429);
  });

  it('the client does not choose its IP: only the one the proxy adds counts', async () => {
    const user = await env.createUser();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await http
        .post('/api/v2/auth/login')
        .set('X-Forwarded-For', `198.51.100.${String(attempt)}, 203.0.113.9`)
        .send({ email: testEmail(`ip-${String(attempt)}`), password: 'Zz9$Otra-Cosa-Aqui!' })
        .expect(401);
    }
    await http
      .post('/api/v2/auth/login')
      .set('X-Forwarded-For', '198.51.100.99, 203.0.113.9')
      .send({ email: user.email, password: 'Zz9$Otra-Cosa-Aqui!' })
      .expect(429);
  });

  it('cuts session renewal off at the 31st attempt in a minute', async () => {
    // No cookie and no token: every attempt reaches the controller and answers
    // 401. What is measured is that the route's cap exists, not the renewal.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const response = await http.post('/api/v2/auth/refresh').send({});
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(401));
    expect(statuses[30]).toBe(429);
  });

  it('cuts sign-up off at the sixth attempt in a minute', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await http.post('/api/v2/auth/register').send({
        email: testEmail('rafaga'),
        password: VALID_PASSWORD,
        displayName: 'Ráfaga',
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual(Array(5).fill(201));
    expect(statuses[5]).toBe(429);
  });

  it('the 429 comes out with the canonical error envelope', async () => {
    const register = () =>
      http
        .post('/api/v2/auth/register')
        .send({ email: testEmail(), password: VALID_PASSWORD, displayName: 'Ráfaga' });
    for (let attempt = 0; attempt < 5; attempt += 1) await register().expect(201);

    const response = await register().expect(429);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({
      status: 429,
      code: 'rate_limited',
      detail: expect.any(String),
    });
  });
});
