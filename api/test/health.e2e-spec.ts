import request from 'supertest';

import { levantarApp, type EntornoDePruebas } from './helpers/app';
import { HealthRepository } from '../src/modules/health/health.repository';

/**
 * Fase 0 — la cadena completa contra MariaDB real (base `coco_test`).
 *
 * Aquí no se simula nada del camino de autenticación: los access token son JWT
 * firmados por el mismo TokenService que usa el login, y el guard global los
 * verifica y consulta la base igual que en producción.
 */
describe('Fase 0 — the auth guard on a protected route, and the public probes (e2e)', () => {
  let entorno: EntornoDePruebas;

  beforeAll(async () => {
    entorno = await levantarApp();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  afterEach(async () => {
    await entorno.limpiar();
  });

  it('sin header Authorization responde 401 con el envelope canónico', async () => {
    const response = await request(entorno.app.getHttpServer()).get('/api/v1/auth/me').expect(401);

    expect(response.body).toEqual({
      error: { code: 'unauthenticated', message: expect.any(String), details: [] },
    });
    // Y jamás filtra detalle interno.
    expect(JSON.stringify(response.body)).not.toMatch(/stack|at Object|\.ts:/i);
  });

  it('con un token que no es un JWT responde 401', async () => {
    await request(entorno.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer esto-no-es-un-token')
      .expect(401);
  });

  // La VERIFICACIÓN DE LA FIRMA es de Supabase: la API comprueba el token
  // contra el JWKS del proyecto con `jose`, y aquí Supabase está sustituido por
  // un doble. Probar la firma en este arnés sería probar el doble, no el
  // sistema. Lo que sí se prueba es lo que decide esta aplicación: a quién
  // reconoce ese token y hasta cuándo lo acepta.

  it('un token de una cuenta que no tiene perfil aquí responde 401', async () => {
    // Existe en Supabase pero nadie la registró en la app: sin perfil no hay
    // rol ni estado, así que no hay nada que autorizar.
    const huerfano = entorno.supabase.sembrar('sin-perfil@pruebas.coco', 'Loquesea-123!');
    const token = entorno.supabase.emitirToken(huerfano);

    await request(entorno.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('un token emitido ANTES de revocar la sesión responde 401', async () => {
    const usuario = await entorno.crearUsuario();

    // Un token de hace una hora, con firma impecable. Lo que lo mata es la
    // marca de revocación, que el guard compara en cada petición.
    const viejo = entorno.supabase.emitirToken(
      usuario.authId!,
      new Date(Date.now() - 60 * 60 * 1000),
    );
    await entorno.prisma.user.update({
      where: { id: usuario.id },
      data: { sessionsValidFrom: new Date() },
    });

    await request(entorno.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${viejo}`)
      .expect(401);
  });

  it('con un token de un usuario que ya no existe responde 401', async () => {
    const usuario = await entorno.crearUsuario();
    const cabecera = entorno.como(usuario);

    await entorno.prisma.auditLog.deleteMany({});
    await entorno.prisma.user.delete({ where: { id: usuario.id } });

    await request(entorno.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', cabecera)
      .expect(401);
  });

  it('a valid token reaches a protected route as THAT user', async () => {
    const usuario = await entorno.crearUsuario();

    const response = await request(entorno.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', entorno.como(usuario))
      .expect(200);

    expect(JSON.stringify(response.body)).toContain(usuario.email);
  });

  it('health is public: 200 without a token, says only that it is alive and which commit', async () => {
    for (const path of ['/api/v1/health', '/api/v2/health']) {
      const response = await request(entorno.app.getHttpServer()).get(path).expect(200);

      // Exactly these two keys: the short SHA and nothing more about the deploy.
      expect(response.body).toEqual({
        data: { status: 'ok', version: expect.stringMatching(/^([0-9a-f]{7}|unknown)$/) },
        meta: {},
      });
    }
  });

  it('ready is public: 200 without a token once the database answers', async () => {
    const response = await request(entorno.app.getHttpServer()).get('/api/v1/ready').expect(200);

    expect(response.body).toEqual({ data: { status: 'ok', db: 'ok' }, meta: {} });
  });

  it('ready answers 503 when the database does not, and health stays 200', async () => {
    const repository = entorno.app.get(HealthRepository);
    const ping = jest.spyOn(repository, 'isDatabaseReachable').mockResolvedValue(false);

    try {
      const response = await request(entorno.app.getHttpServer()).get('/api/v1/ready').expect(503);
      expect(response.body).toEqual({
        error: { code: expect.any(String), message: 'La base de datos no responde.', details: [] },
      });
      // The process is still alive: an unreachable database is not a crash.
      await request(entorno.app.getHttpServer()).get('/api/v1/health').expect(200);
    } finally {
      ping.mockRestore();
    }
  });

  it('every response carries an X-Request-Id', async () => {
    const response = await request(entorno.app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
  });
});
