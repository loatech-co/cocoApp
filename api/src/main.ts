import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config as cargarEnv } from 'dotenv';

import { AppModule } from './app.module';
import { configureApp, parseOrigins } from './bootstrap';
import { installBigIntSerializer } from './common/serialization/bigint';
import { porQueNoArrancar } from './common/entorno';

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

/**
 * Deja rastro legible de un fallo que no se puede atrapar, y se va.
 *
 * El caso real es el motor de Prisma: cuando entra en pánico —por ejemplo con
 * `PANIC: timer has gone away` tras un rato sin tráfico— la excepción nace
 * dentro de Rust, no hay `try` que la contenga, y lo que queda en el log es un
 * volcado de mil líneas de la biblioteca compilada. Una línea propia antes de
 * salir convierte diez minutos de arqueología en un `grep`.
 *
 * Y se SALE, no se intenta seguir: un proceso cuyo motor de base de datos acaba
 * de morir no puede atender nada útil, y quedarse vivo solo produce un sitio que
 * responde 500 a todo en vez de dejar que la plataforma levante uno sano.
 */
function instalarRedDeSeguridad(): void {
  const logger = new Logger('Bootstrap');

  process.on('uncaughtException', (error: Error) => {
    const esPanicoDePrisma = /PANIC|timer has gone away/i.test(error.message);
    logger.error(
      esPanicoDePrisma
        ? `El motor de Prisma entró en pánico (${error.message}). El proceso se reinicia.`
        : `Excepción no atrapada: ${error.message}`,
      error.stack,
    );
    // Salida 0 y no 1: LiteSpeed trata un código distinto de cero como fallo de
    // arranque y aplica una espera antes de reintentar, que es lo que convertía
    // un pánico puntual en un 503 pegado durante minutos. Con 0 respawnea en la
    // siguiente petición.
    process.exit(0);
  });

  process.on('unhandledRejection', (razon: unknown) => {
    logger.error(
      `Promesa rechazada sin manejar: ${razon instanceof Error ? razon.message : String(razon)}`,
      razon instanceof Error ? razon.stack : undefined,
    );
    process.exit(1);
  });
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
  const impedimento = porQueNoArrancar();
  if (impedimento !== null) {
    new Logger('Bootstrap').error(impedimento);
    process.exit(1);
  }

  instalarRedDeSeguridad();
  installBigIntSerializer();

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  configureApp(app, config);

  // Cierra Prisma limpiamente cuando el hosting recicla el proceso.
  app.enableShutdownHooks();

  // Hostinger inyecta el puerto por variable de entorno: nunca uno fijo.
  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');

  logger.log(`API escuchando en http://localhost:${port}/api/v1`);
  logger.log(`CORS permitido para: ${parseOrigins(config).join(', ') || '(ninguno)'}`);
}

void bootstrap();
