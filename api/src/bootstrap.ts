import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { requestContext } from './common/logging/request-context';
import { v1Deprecation } from './common/versioning/v1-deprecation';

/** Every API route lives under `/api/v<version>`. */
const API_ROOT = 'api';

/**
 * The two contract versions side by side (7.2: a breaking change opens a new
 * version, never an in-place change). A controller without a version is v1,
 * which is every controller written before v2; the v2 ones say
 * `version: '2'`. Kept apart from `configureApp` because the OpenAPI
 * generator needs the routes and nothing else.
 */
export function configureRouting(app: INestApplication): void {
  app.setGlobalPrefix(API_ROOT);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}

/**
 * Configuración transversal de la aplicación: prefijo, cabeceras de seguridad,
 * CORS y validación.
 *
 * Vive aparte de `main.ts` a propósito. Si esto se configurara solo en el
 * arranque, las pruebas levantarían una app SIN helmet ni ValidationPipe y
 * estarían verificando algo que no es lo que corre en producción. Al
 * compartir esta función, lo que se prueba es exactamente lo que se despliega.
 */
export function configureApp(
  app: INestApplication,
  config: ConfigService,
  accessLog: (entry: Record<string, unknown>) => void = () => undefined,
): void {
  // First middleware: every later line of the request carries its id (6.8).
  app.use(requestContext(accessLog));

  // v1 answers with `Deprecation` and logs each use, until 7.10 removes it.
  app.use(v1Deprecation(accessLog));

  configureRouting(app);

  // El refresh token viaja en una cookie httpOnly; sin esto no se puede leer.
  app.use(cookieParser());

  app.use(
    helmet({
      hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      frameguard: { action: 'deny' },
      /**
       * CSP para el proceso que sirve TAMBIÉN la SPA.
       *
       * Cada permiso de aquí abajo está por una razón concreta; ninguno es
       * "por si acaso". Lo que no aparece, está prohibido.
       */
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // `wasm-unsafe-eval` habilita WebAssembly, que es lo que ejecuta
          // Tesseract. Pese al nombre, NO habilita eval(): es un permiso
          // mucho más estrecho, creado precisamente para no tener que abrir
          // 'unsafe-eval' entero por culpa del WASM.
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          // 'unsafe-inline' lo exige el estilo en línea que genera Tailwind.
          // fonts.googleapis.com sirve la hoja de Montserrat y Lora.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          // blob: para las vistas previas de las imágenes que se importan.
          imgSrc: ["'self'", 'data:', 'blob:'],
          // Solo a nosotros mismos. La consulta a Have I Been Pwned la hace el
          // SERVIDOR, nunca el navegador, así que no hace falta abrirla aquí.
          connectSrc: ["'self'"],
          // Tesseract y pdf.js crean sus Web Workers desde blobs.
          workerSrc: ["'self'", 'blob:'],
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
    // El navegador debe poder enviar la cookie de refresh. Es seguro porque el
    // origen está en lista blanca exacta: con `credentials: true` un comodín
    // en `origin` sería una brecha, y por eso aquí nunca se usa uno.
    credentials: true,
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
