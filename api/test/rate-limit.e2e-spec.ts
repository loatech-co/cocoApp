import request from 'supertest';

import { VALID_PASSWORD, testEmail, startApp, type TestEnvironment } from './helpers/app';

/**
 * El limitador de tasa, encendido de verdad.
 *
 * Vive en su propio archivo porque el resto de la suite lo desactiva: cuenta
 * intentos por minuto y haría fallar pruebas por motivos ajenos a lo que
 * verifican. Aquí se comprueba que sigue vivo, que es lo que importa — sin esta
 * prueba, alguien podría desactivarlo sin querer y nadie se enteraría.
 *
 * Por qué importa: el registro y el login consumen un hash argon2 de 19 MiB por
 * intento. Sin tope, unas pocas peticiones por segundo bastan para dejar la
 * API sin memoria.
 */
describe('Limitador de tasa (e2e)', () => {
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

  it('corta el login al undécimo intento en un minuto', async () => {
    const user = await env.createUser();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await http
        .post('/api/v2/auth/login')
        .send({ email: user.email, password: 'Zz9$Otra-Cosa-Aqui!' });
      statuses.push(response.status);
    }

    // Los diez primeros llegan al servicio (401: credenciales incorrectas).
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    // El undécimo ni siquiera lo intenta.
    expect(statuses[10]).toBe(429);
  });

  it('detrás del proxy cada cliente tiene su cupo, y cada correo el suyo', async () => {
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

  it('el cliente no elige su IP: solo cuenta la que añade el proxy', async () => {
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

  it('corta la renovación de sesión al intento 31 en un minuto', async () => {
    // Sin cookie ni token: cada intento llega al controlador y responde 401.
    // Lo que se mide es que el tope de la ruta existe, no la renovación.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const response = await http.post('/api/v2/auth/refresh').send({});
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(401));
    expect(statuses[30]).toBe(429);
  });

  it('corta el registro al sexto intento en un minuto', async () => {
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

  it('el 429 sale con el envelope canónico de errores', async () => {
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
