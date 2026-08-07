import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type * as admin from 'firebase-admin';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { FIREBASE_ADMIN } from '../src/common/firebase/firebase-admin.provider';
import { installBigIntSerializer } from '../src/common/serialization/bigint';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Integración de la Fase 0 contra MariaDB real (base `coco_test`, nunca la de
 * desarrollo).
 *
 * Se mockea únicamente `verifyIdToken`: emitir tokens RS256 auténticos en una
 * prueba exigiría llamar a Firebase por red, lo que la volvería lenta y
 * dependiente de internet. Todo lo demás —guard global, resolución del
 * user_id, Prisma, envelope de respuesta, filtro de errores— corre de verdad.
 */
describe('Fase 0 — GET /api/v1/health (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const TOKEN_VALIDO = 'token-valido';
  const TOKEN_FIRMA_ROTA = 'token-firma-rota';
  const TOKEN_EXPIRADO = 'token-expirado';
  const TOKEN_SIN_CORREO = 'token-sin-correo';

  const UID = 'uid-pruebas-fase0';
  const EMAIL = 'pruebas@coco.app';

  const verifyIdToken = jest.fn(async (token: string) => {
    switch (token) {
      case TOKEN_VALIDO:
        return { uid: UID, email: EMAIL, name: 'Usuario de Pruebas' };
      case TOKEN_SIN_CORREO:
        return { uid: UID };
      case TOKEN_EXPIRADO:
        throw new Error('Firebase ID token has expired.');
      default:
        throw new Error('Firebase ID token has invalid signature.');
    }
  });

  beforeAll(async () => {
    installBigIntSerializer();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FIREBASE_ADMIN)
      .useValue({ auth: () => ({ verifyIdToken }) } as unknown as admin.app.App)
      .compile();

    app = moduleRef.createNestApplication();
    // Exactamente la misma configuración que corre en producción: prefijo,
    // helmet, CORS y ValidationPipe. Si esto se duplicara aquí, la prueba
    // verificaría una app distinta a la que se despliega.
    configureApp(app, app.get(ConfigService));
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { firebaseUid: UID } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { firebaseUid: UID } });
    await app.close();
  });

  it('sin header Authorization responde 401 con el envelope canónico', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'unauthenticated',
        message: expect.any(String),
        details: [],
      },
    });
    // Y jamás filtra detalle interno
    expect(JSON.stringify(response.body)).not.toMatch(/stack|at Object|\.ts:/i);
  });

  it('con un token de firma alterada responde 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${TOKEN_FIRMA_ROTA}`)
      .expect(401);
  });

  it('con un token expirado responde 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${TOKEN_EXPIRADO}`)
      .expect(401);
  });

  it('con un token sin correo responde 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${TOKEN_SIN_CORREO}`)
      .expect(401);
  });

  it('con un token válido responde 200, alcanza MariaDB y devuelve el user_id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${TOKEN_VALIDO}`)
      .expect(200);

    expect(response.body).toEqual({
      data: { status: 'ok', db: 'ok', user_id: expect.any(Number) },
      meta: {},
    });
  });

  it('el aprovisionamiento de users es idempotente: tres accesos, una sola fila', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${TOKEN_VALIDO}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${TOKEN_VALIDO}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${TOKEN_VALIDO}`)
      .expect(200);

    const filas = await prisma.user.count({ where: { firebaseUid: UID } });
    expect(filas).toBe(1);
  });

  it('emite las cabeceras de seguridad de helmet', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${TOKEN_VALIDO}`)
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });
});
