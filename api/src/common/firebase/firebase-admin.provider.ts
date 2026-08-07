import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

const AYUDA = [
  'Falta la configuración del service account de Firebase.',
  '',
  'Para obtenerla:',
  '  1. Entra a console.firebase.google.com y abre tu proyecto.',
  '  2. Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.',
  '  3. Del JSON descargado, copia estos tres valores a api/.env:',
  '       FIREBASE_PROJECT_ID    ← project_id',
  '       FIREBASE_CLIENT_EMAIL  ← client_email',
  '       FIREBASE_PRIVATE_KEY   ← private_key (con los \\n tal cual, entre comillas)',
  '',
  'El JSON completo NO se guarda en el repositorio: api/.env está en .gitignore.',
].join('\n');

/**
 * Inicializa el SDK de Firebase Admin UNA sola vez en el ciclo de vida del
 * proceso. Al ser un proceso persistente, el cliente queda vivo entre
 * peticiones con las llaves públicas de Google ya cacheadas en memoria — no se
 * paga esa descarga en cada request.
 *
 * Las credenciales del service account NUNCA se commitean: el JSON se
 * descompone en tres variables de entorno. La clave privada llega con `\n`
 * escapados (así la guarda hPanel en una sola línea) y hay que restaurarlos, o
 * la verificación de firma falla.
 */
export const firebaseAdminProvider: Provider = {
  provide: FIREBASE_ADMIN,
  inject: [ConfigService],
  useFactory: (config: ConfigService): admin.app.App => {
    const logger = new Logger('FirebaseAdmin');

    if (admin.apps.length > 0) {
      return admin.app() as admin.app.App;
    }

    const projectId = config.getOrThrow<string>('FIREBASE_PROJECT_ID');
    const clientEmail = config.getOrThrow<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = config.getOrThrow<string>('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');

    // Un placeholder sin reemplazar produciría un error de OpenSSL ilegible.
    // Mejor detectarlo aquí y decir exactamente qué falta.
    const sinConfigurar =
      [projectId, clientEmail, privateKey].some((valor) => valor.includes('__CAMBIAR__')) ||
      !privateKey.includes('BEGIN PRIVATE KEY');

    if (sinConfigurar) {
      logger.error(AYUDA);
      throw new Error('Firebase Admin sin configurar. Revisa api/.env');
    }

    try {
      const app = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      logger.log(`Firebase Admin inicializado para el proyecto "${projectId}"`);
      return app;
    } catch (error) {
      logger.error(
        `No se pudo inicializar Firebase Admin: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.error(AYUDA);
      throw error;
    }
  },
};
