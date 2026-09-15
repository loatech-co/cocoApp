import request from 'supertest';

import { levantarApp, type EntornoDePruebas } from './helpers/app';

/**
 * Fase 0 — la cadena completa contra MariaDB real (base `coco_test`).
 *
 * Aquí no se simula nada del camino de autenticación: los access token son JWT
 * firmados por el mismo TokenService que usa el login, y el guard global los
 * verifica y consulta la base igual que en producción.
 */
describe('Fase 0 — GET /api/v1/health (e2e)', () => {
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
    const response = await request(entorno.app.getHttpServer())
      .get('/api/v1/health')
      .expect(401);

    expect(response.body).toEqual({
      error: { code: 'unauthenticated', message: expect.any(String), details: [] },
    });
    // Y jamás filtra detalle interno.
    expect(JSON.stringify(response.body)).not.toMatch(/stack|at Object|\.ts:/i);
  });

  it('con un token que no es un JWT responde 401', async () => {
    await request(entorno.app.getHttpServer())
      .get('/api/v1/health')
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
      .get('/api/v1/health')
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
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${viejo}`)
      .expect(401);
  });

  it('con un token de un usuario que ya no existe responde 401', async () => {
    const usuario = await entorno.crearUsuario();
    const cabecera = entorno.como(usuario);

    await entorno.prisma.auditLog.deleteMany({});
    await entorno.prisma.user.delete({ where: { id: usuario.id } });

    await request(entorno.app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', cabecera)
      .expect(401);
  });

  it('con un token válido responde 200, alcanza MariaDB y devuelve el user_id', async () => {
    const usuario = await entorno.crearUsuario();

    const response = await request(entorno.app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', entorno.como(usuario))
      .expect(200);

    expect(response.body).toEqual({
      data: { status: 'ok', db: 'ok', user_id: Number(usuario.id) },
      meta: {},
    });
  });

  it('emite las cabeceras de seguridad de helmet', async () => {
    const usuario = await entorno.crearUsuario();

    const response = await request(entorno.app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', entorno.como(usuario))
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });
});
