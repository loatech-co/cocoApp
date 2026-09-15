import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { User, UserRole, UserStatus } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { installBigIntSerializer } from '../../src/common/serialization/bigint';
import { SupabaseAuthService } from '../../src/modules/auth/supabase-auth.service';
import { SupabaseAuthFalso } from './supabase-auth-falso';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Entorno de pruebas de extremo a extremo contra MariaDB real (base
 * `coco_test`, nunca la de desarrollo).
 *
 * A diferencia del montaje anterior con Firebase, aquí NO se sustituye nada del
 * camino de autenticación: se firman y verifican JWT de verdad, se hashea con
 * argon2 de verdad y el guard global consulta la base de verdad. La auth es
 * propia, así que no hay razón para simularla — probarla simulada sería probar
 * el simulacro.
 *
 * Lo único que se puede desactivar es el limitador de tasa, porque cuenta
 * intentos por minuto y haría fallar suites que hacen muchas llamadas seguidas
 * por motivos que nada tienen que ver con lo que están verificando. Hay una
 * prueba dedicada que lo enciende y comprueba que sigue vivo.
 */
export interface EntornoDePruebas {
  app: INestApplication;
  prisma: PrismaService;
  /** Crea un usuario ya listo para usar, sin pasar por el endpoint de registro. */
  crearUsuario: (datos?: DatosDeUsuario) => Promise<UsuarioDePrueba>;
  /** El doble de Supabase Auth, para fabricar casos que el flujo normal no da. */
  supabase: SupabaseAuthFalso;
  /** Cabecera `Authorization` con un access token real para ese usuario. */
  como: (usuario: UsuarioDePrueba) => string;
  limpiar: () => Promise<void>;
  cerrar: () => Promise<void>;
}

export interface DatosDeUsuario {
  email?: string;
  password?: string;
  displayName?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface UsuarioDePrueba extends User {
  /** La contraseña en claro, para poder hacer login en la prueba. */
  passwordEnClaro: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Contraseña que cumple la política entera: 16 caracteres, mayúscula,
 * minúscula, dígito y símbolo, sin parecerse al correo ni al nombre de las
 * cuentas de prueba (y sin la palabra "coco", que la política prohíbe).
 */
export const PASSWORD_VALIDA = 'Xk9$Ronda-Verde!';
/** Otra distinta, para las pruebas de cambio de contraseña. */
export const PASSWORD_NUEVA = 'Zt4&Nube-Lejana!';

/**
 * Todo correo de prueba vive bajo este dominio. `limpiar()` no lo usa —vacía la
 * base entera— pero mantenerlo hace obvio en cualquier volcado qué filas son
 * de pruebas.
 */
const DOMINIO_DE_PRUEBAS = 'pruebas.coco';

let contador = 0;

/** Correo único por llamada: evita colisiones entre pruebas del mismo archivo. */
export function correoDePrueba(prefijo = 'usuario'): string {
  contador += 1;
  return `${prefijo}-${process.pid}-${contador}@${DOMINIO_DE_PRUEBAS}`;
}

/**
 * Cortafuegos: `limpiar()` vacía TODAS las tablas, así que apuntar a la base
 * equivocada sería destructivo. Se comprueba el nombre de la base antes de
 * levantar nada, no se confía en que el `.env` correcto esté cargado.
 */
function exigirBaseDePruebas(): void {
  const url = process.env.DATABASE_URL ?? '';
  const nombre = url.split('/').pop()?.split('?')[0] ?? '';

  if (!nombre.endsWith('_test')) {
    throw new Error(
      `Las pruebas e2e vacían la base entera y esta no es de pruebas: "${nombre}". ` +
        'Revisa que .env.test esté cargado (test/setup-env.ts).',
    );
  }
}

export async function levantarApp(
  opciones: { conLimitador?: boolean } = {},
): Promise<EntornoDePruebas> {
  exigirBaseDePruebas();
  installBigIntSerializer();

  const constructor = Test.createTestingModule({ imports: [AppModule] });

  // Supabase Auth se sustituye por un doble en memoria. Hablar con el proyecto
  // real crearía cuentas de verdad en cada corrida —no hay proyecto de pruebas
  // en el plan gratuito— y ataría las pruebas a la red.
  const supabase = new SupabaseAuthFalso();
  constructor.overrideProvider(SupabaseAuthService).useValue(supabase);

  if (!opciones.conLimitador) {
    // Se sustituye el ALMACÉN del limitador, no el guard: `APP_GUARD` con
    // `useClass` instancia la clase directamente y `overrideGuard` no llega a
    // tocarla. Con un almacén que siempre reporta cero golpes, el guard corre
    // de verdad —decoradores, resolución de la clave, todo— pero nunca frena.
    constructor.overrideProvider(ThrottlerStorage).useValue({
      increment: (): Promise<ThrottlerStorageRecord> =>
        Promise.resolve({
          totalHits: 0,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
    });
  }

  const moduleRef = await constructor.compile();

  const app = moduleRef.createNestApplication();
  // Exactamente la misma configuración que corre en producción: prefijo,
  // cookies, helmet, CORS y ValidationPipe. Si esto se duplicara aquí, la
  // prueba verificaría una app distinta a la que se despliega.
  configureApp(app, app.get(ConfigService));
  await app.init();

  const prisma = app.get(PrismaService);

  const crearUsuario = async (datos: DatosDeUsuario = {}): Promise<UsuarioDePrueba> => {
    const password = datos.password ?? PASSWORD_VALIDA;

    const email = datos.email ?? correoDePrueba();
    const authId = supabase.sembrar(email, password);

    const usuario = await prisma.user.create({
      data: {
        authId,
        email,
        displayName: datos.displayName ?? 'Usuario de Pruebas',
        role: datos.role ?? 'user',
        status: datos.status ?? 'active',
        // Al segundo, como hace el registro real: el `iat` del token no tiene
        // más precisión y una marca con milisegundos dejaría fuera al token
        // que se emite justo después.
        sessionsValidFrom: new Date(Math.floor(Date.now() / 1000) * 1000),
      },
    });

    // La sesión se abre directamente contra el doble, sin pasar por
    // POST /auth/login: la mayoría de las pruebas solo necesitan "estar
    // dentro" y no deben gastar el cupo del limitador para lograrlo.
    const sesion = supabase.abrirSesion(authId, email);

    return {
      ...usuario,
      passwordEnClaro: password,
      accessToken: sesion.accessToken,
      refreshToken: sesion.refreshToken,
    };
  };

  /**
   * Vacía la base de pruebas en orden de dependencias.
   *
   * No basta con borrar los usuarios y confiar en el CASCADE: la FK
   * `transactions.account_id` es RESTRICT a propósito —para que nadie borre una
   * cuenta con historial— y eso bloquea la cascada. Y `audit_log.user_id` es
   * SetNull, así que las filas de bitácora sobrevivirían al usuario.
   */
  const limpiar = async (): Promise<void> => {
    // splits y transaction_tags caen por CASCADE desde transactions.
    await prisma.transaction.deleteMany({});
    // import_rows cae por CASCADE desde import_batches. Los lotes van ANTES que
    // las cuentas: `import_batches.account_id` es RESTRICT, igual que el de
    // transactions, para que borrar una cuenta no se lleve su historial.
    await prisma.importBatch.deleteMany({});
    await prisma.categoryRule.deleteMany({});
    await prisma.tag.deleteMany({});
    // Las hijas primero: parent_id es SetNull, pero así queda determinista.
    await prisma.category.deleteMany({ where: { parentId: { not: null } } });
    await prisma.category.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.auditLog.deleteMany({});
    // approved_by_id apunta a users: se limpia antes para no chocar con la FK.
    await prisma.user.updateMany({ data: { approvedById: null } });
    await prisma.user.deleteMany({});
    // El doble guarda sus cuentas en memoria y sobrevive entre pruebas del
    // mismo archivo: sin esto, un correo reutilizado chocaría con una cuenta
    // fantasma de la prueba anterior.
    supabase.limpiar();
  };

  await limpiar();

  return {
    app,
    prisma,
    crearUsuario,
    supabase,
    como: (usuario: UsuarioDePrueba) => `Bearer ${usuario.accessToken}`,
    limpiar,
    cerrar: async () => {
      await limpiar();
      await app.close();
    },
  };
}
