import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type * as admin from 'firebase-admin';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { FIREBASE_ADMIN } from '../../src/common/firebase/firebase-admin.provider';
import { installBigIntSerializer } from '../../src/common/serialization/bigint';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Cada "token" de prueba es simplemente el uid del usuario.
 *
 * Solo se sustituye `verifyIdToken`: emitir tokens RS256 auténticos exigiría
 * llamar a Firebase por red en cada prueba, volviéndolas lentas y dependientes
 * de internet. Todo lo demás —guard global, resolución del user_id, Prisma,
 * envelopes, filtro de errores— corre de verdad.
 */
const verifyIdToken = jest.fn(async (token: string) => {
  if (!token.startsWith('uid:')) {
    throw new Error('Firebase ID token has invalid signature.');
  }
  const uid = token.slice(4);
  return { uid, email: `${uid}@pruebas.coco`, name: uid };
});

export interface EntornoDePruebas {
  app: INestApplication;
  prisma: PrismaService;
  /** Cabecera de autorización para un usuario dado. */
  como: (uid: string) => string;
  limpiar: () => Promise<void>;
  cerrar: () => Promise<void>;
}

export async function levantarApp(): Promise<EntornoDePruebas> {
  installBigIntSerializer();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FIREBASE_ADMIN)
    .useValue({ auth: () => ({ verifyIdToken }) } as unknown as admin.app.App)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app, app.get(ConfigService));
  await app.init();

  const prisma = app.get(PrismaService);

  /**
   * Limpia los datos de prueba en orden de dependencias.
   *
   * No basta con borrar el usuario y confiar en el CASCADE: la FK
   * `transactions.account_id` es RESTRICT a propósito —para que nadie borre una
   * cuenta con historial— y eso bloquea la cascada. Hay que vaciar los
   * movimientos antes que las cuentas.
   *
   * Corre contra `coco_test`, nunca contra la base de desarrollo.
   */
  const limpiar = async (): Promise<void> => {
    const usuarios = await prisma.user.findMany({
      where: { firebaseUid: { startsWith: 'e2e-' } },
      select: { id: true },
    });
    if (usuarios.length === 0) return;

    const userIds = usuarios.map((usuario) => usuario.id);

    // splits y transaction_tags caen por CASCADE desde transactions.
    await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.tag.deleteMany({ where: { userId: { in: userIds } } });
    // Las hijas primero: parent_id es SetNull, pero así queda determinista.
    await prisma.category.deleteMany({
      where: { userId: { in: userIds }, parentId: { not: null } },
    });
    await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  };

  return {
    app,
    prisma,
    como: (uid: string) => `Bearer uid:${uid}`,
    limpiar,
    cerrar: async () => {
      await limpiar();
      await app.close();
    },
  };
}
