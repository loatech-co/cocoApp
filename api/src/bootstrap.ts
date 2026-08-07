import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

/**
 * Configuración transversal de la aplicación: prefijo, cabeceras de seguridad,
 * CORS y validación.
 *
 * Vive aparte de `main.ts` a propósito. Si esto se configurara solo en el
 * arranque, las pruebas levantarían una app SIN helmet ni ValidationPipe y
 * estarían verificando algo que no es lo que corre en producción. Al
 * compartir esta función, lo que se prueba es exactamente lo que se despliega.
 */
export function configureApp(app: INestApplication, config: ConfigService): void {
  app.setGlobalPrefix('api/v1');

  app.use(
    helmet({
      hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      frameguard: { action: 'deny' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: [
            "'self'",
            'https://securetoken.googleapis.com',
            'https://identitytoolkit.googleapis.com',
          ],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
    }),
  );

  app.enableCors({
    origin: parseOrigins(config),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Descarta propiedades no declaradas en el DTO...
      whitelist: true,
      // ...y además rechaza la petición si venían. Así, si alguien intenta
      // colar un `userId` en el body, muere aquí y no llega al servicio.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

/** Orígenes permitidos por CORS. Lista exacta, sin comodines, nunca. */
export function parseOrigins(config: ConfigService): string[] {
  return (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
