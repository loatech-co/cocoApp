import request from 'supertest';

import { VALID_PASSWORD, testEmail, startApp, type TestEnvironment } from './helpers/app';

/**
 * Phase 4 — a session for a native client (e2e).
 *
 * The web keeps the refresh token in an httpOnly cookie; a phone app cannot,
 * so, identifying itself with `X-Coco-Client: native`, it receives it and
 * sends it in the body. What cannot fail: that the cookie does not show up for
 * the native client, that the token rotates, that logout kills it, that
 * revocation through `sessions_valid_from` reaches it too, and that the web
 * stays EXACTLY the same.
 */
describe('Phase 4 — Native client (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  const NATIVE = { 'X-Coco-Client': 'native' };

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
  });

  const cookiesOf = (r: request.Response): string[] =>
    ((r.headers['set-cookie'] as unknown as string[] | undefined) ?? []).filter((c) =>
      c.startsWith('coco_refresh='),
    );

  async function nativeLogin() {
    const user = await env.createUser();
    const r = await http
      .post('/api/v2/auth/login')
      .set(NATIVE)
      .send({ email: user.email, password: VALID_PASSWORD });
    return { user, r };
  }

  describe('Login', () => {
    it('returns the refresh token IN THE BODY and sets no cookie', async () => {
      const { r } = await nativeLogin();

      expect(r.status).toBe(200);
      expect(typeof r.body.data.accessToken).toBe('string');
      expect(typeof r.body.data.refreshToken).toBe('string');
      expect(r.body.data.refreshToken.length).toBeGreaterThan(10);
      expect(cookiesOf(r)).toEqual([]);
    });

    it('the web stays the same: httpOnly cookie and NO refresh token in the body', async () => {
      const user = await env.createUser();
      const r = await http
        .post('/api/v2/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD });

      expect(r.status).toBe(200);
      expect(r.body.data.refreshToken).toBeUndefined();
      const [cookie] = cookiesOf(r);
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
    });

    it('with a wrong password, the native client gets the same as the web: 401 with no hints', async () => {
      const user = await env.createUser();
      const r = await http
        .post('/api/v2/auth/login')
        .set(NATIVE)
        .send({ email: user.email, password: 'otra' });
      expect(r.status).toBe(401);
      expect(r.body.data).toBeUndefined();
    });
  });

  describe('Refresh', () => {
    it('renews with the token in the body, ROTATES the refresh token and sets no cookie', async () => {
      const { r: login } = await nativeLogin();
      const oldToken = login.body.data.refreshToken as string;

      const r = await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: oldToken });

      expect(r.status).toBe(200);
      expect(typeof r.body.data.accessToken).toBe('string');
      expect(r.body.data.refreshToken).not.toBe(oldToken);
      expect(cookiesOf(r)).toEqual([]);

      // The used token died: that is what stops a stolen one from working twice.
      await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: oldToken })
        .expect(401);
      // And the new one works.
      await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: r.body.data.refreshToken })
        .expect(200);
    });

    it('reusing the PREVIOUS refresh token after rotating is 401, and the one born from it stays alive', async () => {
      /*
        This is why the app has to renew with ONE flight at a time: if two
        requests renew in parallel with the same token, the second arrives
        with one that already died and gets 401 even though the session is
        fine. The real Supabase goes further —it detects the reuse and kills
        the whole family—; the double only rotates, so here the 401 is tested
        and that the new one works.
      */
      const { r: login } = await nativeLogin();
      const oldToken = login.body.data.refreshToken as string;
      const rotated = await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: oldToken })
        .expect(200);
      const newToken = rotated.body.data.refreshToken as string;

      const reuse = await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: oldToken });
      expect(reuse.status).toBe(401);
      expect(reuse.body.data).toBeUndefined();
      expect(reuse.headers['set-cookie']).toBeUndefined();

      await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: newToken })
        .expect(200);
    });

    it('without a token in the body, 401 —and it ignores the cookie even if one came—', async () => {
      const user = await env.createUser();
      const web = await http
        .post('/api/v2/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD });
      const cookie = cookiesOf(web)[0]!.split(';')[0]!;

      // A client that says it is native is judged by its own world: the body.
      await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .set('Cookie', cookie)
        .send({})
        .expect(401);
      // Whereas the web, with that same cookie, renews.
      await http.post('/api/v2/auth/refresh').set('Cookie', cookie).expect(200);
    });

    it('a native refresh with an invalid token is 401 and touches no cookies', async () => {
      const r = await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: 'refresco-inventado' });
      expect(r.status).toBe(401);
      expect(r.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('Logout', () => {
    it('logs out with the token in the body: that token stops working', async () => {
      const { r: login } = await nativeLogin();
      const refresh = login.body.data.refreshToken as string;

      await http
        .post('/api/v2/auth/logout')
        .set(NATIVE)
        .send({ refreshToken: refresh })
        .expect(204);
      await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: refresh })
        .expect(401);
    });

    it('logout-all from the native client revokes access tokens already issued, instantly', async () => {
      const { r: login } = await nativeLogin();
      const header = `Bearer ${login.body.data.accessToken as string}`;

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(200);
      // Revocation takes a second to be told apart from a token issued in the
      // same second: see the guard's comment.
      await new Promise((stillValid) => setTimeout(stillValid, 1100));
      await http
        .post('/api/v2/auth/logout-all')
        .set('Authorization', header)
        .set(NATIVE)
        .expect(204);
      await http.get('/api/v2/auth/me').set('Authorization', header).expect(401);
    });
  });

  describe('What changes for nobody', () => {
    it('the native access token goes through the same guard as the web one', async () => {
      const { r } = await nativeLogin();
      const me = await http
        .get('/api/v2/auth/me')
        .set('Authorization', `Bearer ${r.body.data.accessToken as string}`);
      expect(me.status).toBe(200);
      expect(me.body.data.email).toBe(r.body.data.user.email);
    });

    it('an unknown email with the native header cannot be told apart either', async () => {
      const r = await http
        .post('/api/v2/auth/login')
        .set(NATIVE)
        .send({ email: testEmail(), password: VALID_PASSWORD });
      expect(r.status).toBe(401);
    });
  });
});
