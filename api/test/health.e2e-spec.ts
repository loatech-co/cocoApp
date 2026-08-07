import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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

  it('con un JWT firmado con OTRO secreto responde 401', async () => {
    const usuario = await entorno.crearUsuario();
    const jwt = entorno.app.get(JwtService);

    // Mismos claims exactos, secreto distinto: si esto pasara, la firma no
    // estaría verificándose y cualquiera podría fabricarse un token.
    const falsificado = await jwt.signAsync(
      { sub: usuario.id.toString(), email: usuario.email, role: 'admin', authTime: Date.now() },
      { secret: 'un-secreto-que-no-es-el-nuestro', expiresIn: '15m' },
    );

    await request(entorno.app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${falsificado}`)
      .expect(401);
  });

  it('con un token expirado responde 401', async () => {
    const usuario = await entorno.crearUsuario();
    const jwt = entorno.app.get(JwtService);
    const secreto = entorno.app.get(ConfigService).getOrThrow<string>('JWT_SECRET');

    const expirado = await jwt.signAsync(
      { sub: usuario.id.toString(), email: usuario.email, role: usuario.role, authTime: Date.now() },
      { secret: secreto, expiresIn: '-1s' },
    );

    await request(entorno.app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${expirado}`)
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
