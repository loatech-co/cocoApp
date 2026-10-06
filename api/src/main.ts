import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config as cargarEnv } from 'dotenv';
import { join } from 'node:path';

import { AppModule } from './app.module';
import { configureApp, parseOrigins } from './bootstrap';
import { whyTheEnvironmentIsInvalid } from './common/config/env';
import { porQueNoArrancar } from './common/env';
import { defaultLogDirectory, JsonLogger, parseLogLevel } from './common/logging/json-logger';
import { installSafetyNet } from './common/process/safety-net';
import { installBigIntSerializer } from './common/serialization/bigint';
import { CONTRACT_VERSIONS, docsPath, setupApiDocs } from './openapi/document';

/**
 * Arranque de la API.
 *
 * En Hostinger esto corre como Node.js Web App: un proceso persistente cuyo
 * entry es el `dist/main.js` compilado, no el TypeScript. El bootstrap ocurre
 * UNA vez (y de nuevo tras cada reinicio), no por petición — por eso el pool de
 * conexiones de Prisma queda vivo entre requests, que es justamente la ventaja
 * de un proceso de larga vida frente al modelo "un intérprete por petición".
 *
 * Este mismo proceso sirve también la SPA compilada (ver SpaModule): una sola
 * app, un solo dominio, sin CORS y con la cookie de sesión como cookie de
 * primera parte.
 */
/**
 * Carga el `.env` de la aplicación ANTES de que Nest construya nada, y le da
 * PRIORIDAD sobre las variables que ya estén en el entorno.
 *
 * Esto invierte la precedencia habitual, y es deliberado. En la Node.js Web App
 * de Hostinger, LiteSpeed inyecta las variables configuradas en hPanel al
 * arrancar el proceso. Esa configuración se llenó una vez, al crear la app, y
 * queda invisible desde el repositorio y desde SSH: no hay archivo que editar.
 * Cuando la base cambió de MariaDB a Postgres, hPanel siguió inyectando la
 * `DATABASE_URL` vieja y ganaba siempre —dotenv nunca pisa una clave existente—,
 * así que la aplicación se conectaba a la base equivocada o no arrancaba.
 *
 * El síntoma era engañoso: Prisma fallaba con un P1012 que se lee como si la
 * URL estuviera mal escrita ("the URL must start with postgresql://") cuando en
 * realidad estaba recibiendo, intacta, la URL de MySQL de hace meses.
 *
 * La ruta es ABSOLUTA, derivada de __dirname (`api/dist`), para no depender del
 * directorio de trabajo con que la plataforma arranque el proceso.
 *
 * Consecuencia a tener presente: para cambiar la base ya no sirve tocar hPanel,
 * hay que cambiar el archivo `.env` que acompaña al despliegue.
 */
function cargarConfiguracion(): void {
  const archivo = join(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env');
  const { parsed } = cargarEnv({ path: archivo, override: true });
  if (!parsed) {
    Logger.warn(`No se encontró ${archivo}; se usan las variables del entorno.`, 'Bootstrap');
  }
  desentrecomillar();
}

/**
 * Quita las comillas que envuelven un valor heredado del entorno.
 *
 * LiteSpeed inyecta las variables de la Node.js App tal como se guardaron,
 * comillas incluidas: `DATABASE_URL` llega literalmente como
 * `"postgresql://…"`, con la comilla dentro del valor. Un archivo `.env` lo
 * tolera porque dotenv interpreta las comillas; una variable de entorno no,
 * y Prisma rechaza la URL con un P1012 que culpa al protocolo.
 *
 * Mientras el `.env` del despliegue exista, esto no cambia nada: ese archivo ya
 * ganó. Importa el día que falte —un despliegue a medias, un archivo sin
 * copiar— porque entonces el valor heredado es lo único que queda, y así al
 * menos es utilizable en vez de fallar por un par de comillas.
 */
function desentrecomillar(): void {
  for (const clave of ['DATABASE_URL', 'DIRECT_URL']) {
    const valor = process.env[clave];
    if (!valor) continue;
    const limpio = valor.replace(/^(['"])(.*)\1$/s, '$2');
    if (limpio !== valor) {
      process.env[clave] = limpio;
      Logger.warn(`Se quitaron las comillas de ${clave}, heredada del entorno.`, 'Bootstrap');
    }
  }
}

async function bootstrap(): Promise<void> {
  cargarConfiguracion();

  /*
    Antes de nada: ¿a qué base apunta esto?

    Va AQUÍ, delante de `NestFactory.create`, porque lo que hay que impedir es
    la conexión. Comprobarlo más tarde —en un módulo, en un guard— ya sería
    tarde: Prisma se conecta al construirse, así que la sesión contra la base
    remota ya existiría cuando saltara el aviso.

    Y se sale con código 1, que es lo correcto para un arranque que no debía
    ocurrir. El código 0 de más abajo es para otra cosa: un pánico de Prisma en
    marcha, donde LiteSpeed tiene que respawnear sin penalización.
  */
  // The environment is checked first, whole (step 7.4): one message listing
  // every missing or invalid variable instead of a crash at the first use.
  const impedimento = whyTheEnvironmentIsInvalid() ?? porQueNoArrancar();
  if (impedimento !== null) {
    new Logger('Bootstrap').error(impedimento);
    process.exit(1);
  }

  // JSON lines with the request id, to stdout and to a rotated file outside
  // the release folder (phase 6.8). Installed before anything else logs.
  const jsonLogger = new JsonLogger({
    directory: defaultLogDirectory(process.env),
    minLevel: parseLogLevel(process.env.LOG_LEVEL),
  });
  Logger.overrideLogger(jsonLogger);

  installSafetyNet();
  installBigIntSerializer();

  const app = await NestFactory.create(AppModule, { logger: jsonLogger });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  configureApp(app, config, (entry) => jsonLogger.entry(entry));

  // Swagger UI at /api/docs/v1 and /api/docs/v2, never in production: the contract
  // is already in api/openapi.v1.json and api/openapi.v2.json, and a live console
  // beside real data is surface for nothing.
  const docs = setupApiDocs(app, config.get<string>('NODE_ENV'));

  // Cierra Prisma limpiamente cuando el hosting recicla el proceso.
  app.enableShutdownHooks();

  // Hostinger inyecta el puerto por variable de entorno: nunca uno fijo.
  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');

  logger.log(`API escuchando en http://localhost:${port}/api/v1 y /api/v2`);
  if (docs) {
    for (const version of CONTRACT_VERSIONS) {
      logger.log(`API docs at http://localhost:${port}/${docsPath(version)}`);
    }
  }
  logger.log(`CORS permitido para: ${parseOrigins(config).join(', ') || '(ninguno)'}`);
}

void bootstrap();
