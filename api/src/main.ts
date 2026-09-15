import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config as cargarEnv } from 'dotenv';

import { AppModule } from './app.module';
import { configureApp, parseOrigins } from './bootstrap';
import { installBigIntSerializer } from './common/serialization/bigint';

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
}

async function bootstrap(): Promise<void> {
  cargarConfiguracion();
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
