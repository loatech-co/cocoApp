import request from 'supertest';

import { VALID_PASSWORD, testEmail, startApp, type TestEnvironment } from './helpers/app';

/**
 * Fase 4 — sesión para un cliente nativo (e2e).
 *
 * La web guarda el refresh en una cookie httpOnly; una app del teléfono no
 * puede, así que, identificándose con `X-Coco-Cliente: nativo`, lo recibe y lo
 * manda en el cuerpo. Lo que no puede fallar: que la cookie no aparezca para
 * el nativo, que el token rote, que el logout lo mate, que la revocación por
 * `sessions_valid_from` también lo alcance, y que la web siga EXACTAMENTE igual.
 */
describe('Fase 4 — Cliente nativo (e2e)', () => {
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
    it('devuelve el refresh token EN EL CUERPO y no pone ninguna cookie', async () => {
      const { r } = await nativeLogin();

      expect(r.status).toBe(200);
      expect(typeof r.body.data.accessToken).toBe('string');
      expect(typeof r.body.data.refreshToken).toBe('string');
      expect(r.body.data.refreshToken.length).toBeGreaterThan(10);
      expect(cookiesOf(r)).toEqual([]);
    });

    it('la web sigue igual: cookie httpOnly y NADA de refresh en el cuerpo', async () => {
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

    it('con contraseña incorrecta, el nativo recibe lo mismo que la web: 401 sin pistas', async () => {
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
    it('renueva con el token del cuerpo, ROTA el refresh y no pone cookie', async () => {
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

      // El token usado murió: es lo que impide que uno robado sirva dos veces.
      await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: oldToken })
        .expect(401);
      // Y el nuevo sirve.
      await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: r.body.data.refreshToken })
        .expect(200);
    });

    it('reusar el refresh ANTERIOR tras rotar es 401, y el que nació de él sigue vivo', async () => {
      /*
        Por esto la app tiene que renovar con UN solo vuelo a la vez: si dos
        peticiones renuevan en paralelo con el mismo token, la segunda llega
        con uno que ya murió y recibe 401 aunque la sesión esté bien. Supabase
        de verdad va más lejos —detecta el reuso y mata la familia entera—; el
        doble solo rota, así que aquí se prueba el 401 y que el nuevo sirve.
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

    it('sin token en el cuerpo, 401 —y no mira la cookie aunque viniera—', async () => {
      const user = await env.createUser();
      const web = await http
        .post('/api/v2/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD });
      const cookie = cookiesOf(web)[0]!.split(';')[0]!;

      // Un cliente que dice ser nativo se juzga por su mundo: el cuerpo.
      await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .set('Cookie', cookie)
        .send({})
        .expect(401);
      // Mientras que la web, con esa misma cookie, renueva.
      await http.post('/api/v2/auth/refresh').set('Cookie', cookie).expect(200);
    });

    it('un refresh nativo con token inválido es 401 y no toca cookies', async () => {
      const r = await http
        .post('/api/v2/auth/refresh')
        .set(NATIVE)
        .send({ refreshToken: 'refresco-inventado' });
      expect(r.status).toBe(401);
      expect(r.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('Logout', () => {
    it('cierra con el token del cuerpo: ese token deja de servir', async () => {
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

    it('logout-all desde el nativo revoca los access token ya emitidos, al instante', async () => {
      const { r: login } = await nativeLogin();
      const header = `Bearer ${login.body.data.accessToken as string}`;

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(200);
      // La revocación tarda un segundo en poder distinguirse del token emitido
      // en el mismo segundo: ver el comentario del guard.
      await new Promise((stillValid) => setTimeout(stillValid, 1100));
      await http
        .post('/api/v2/auth/logout-all')
        .set('Authorization', header)
        .set(NATIVE)
        .expect(204);
      await http.get('/api/v2/auth/me').set('Authorization', header).expect(401);
    });
  });

  describe('Lo que no cambia para nadie', () => {
    it('el access token nativo entra por el mismo guard que el de la web', async () => {
      const { r } = await nativeLogin();
      const me = await http
        .get('/api/v2/auth/me')
        .set('Authorization', `Bearer ${r.body.data.accessToken as string}`);
      expect(me.status).toBe(200);
      expect(me.body.data.email).toBe(r.body.data.user.email);
    });

    it('un correo inexistente con cabecera nativa tampoco se distingue', async () => {
      const r = await http
        .post('/api/v2/auth/login')
        .set(NATIVE)
        .send({ email: testEmail(), password: VALID_PASSWORD });
      expect(r.status).toBe(401);
    });
  });
});
