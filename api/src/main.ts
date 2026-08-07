import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

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
async function bootstrap(): Promise<void> {
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
