import { VersioningType, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { RequestHandler } from 'express';
import helmet from 'helmet';

import { requestContext } from './common/logging/request-context';
import { proxyHeadersProbe, trustProxyHops } from './common/proxy/client-ip';
import { FieldValidationPipe } from './common/validation/field-validation.pipe';

/** Every API route lives under `/api/v<version>`. */
const API_ROOT = 'api';

/** Browser features: only what the SPA uses, and only for itself. */
export const PERMISSIONS_POLICY = [
  'camera=(self)',
  'clipboard-read=(self)',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'browsing-topics=()',
].join(', ');

/**
 * Versioned by URI (7.2: a breaking change opens a new version, never an
 * in-place change). v2 is the only one since v1 was retired (7.10); a
 * controller without a version lands in it. Kept apart from `configureApp`
 * because the OpenAPI generator needs the routes and nothing else.
 */
export function configureRouting(app: INestApplication): void {
  app.setGlobalPrefix(API_ROOT);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '2' });
}

/**
 * Cross-cutting application setup: prefix, security headers, CORS and
 * validation.
 *
 * It lives apart from `main.ts` on purpose. If this were configured only at
 * boot, the tests would bring up an app WITHOUT helmet or ValidationPipe and
 * would be verifying something that is not what runs in production. By
 * sharing this function, what is tested is exactly what is deployed.
 */
export function configureApp(
  app: INestApplication,
  config: ConfigService,
  accessLog: (entry: Record<string, unknown>) => void = () => undefined,
): void {
  // `req.ip` is the client, not LiteSpeed: the rate limiter and audit_log
  // key on it. See `client-ip.ts` for why it is a hop count.
  (app as NestExpressApplication).set(
    'trust proxy',
    trustProxyHops(config.get<string>('TRUST_PROXY_HOPS')),
  );

  // First middleware: every later line of the request carries its id (6.8).
  app.use(requestContext(accessLog));
  app.use(proxyHeadersProbe(config.get<string>('LOG_PROXY_HEADERS') === 'true', accessLog));

  configureRouting(app);

  // The refresh token travels in an httpOnly cookie; without this it cannot be read.
  app.use(cookieParser());

  app.use(...securityHeaders());

  app.enableCors({
    origin: parseOrigins(config),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    // The browser must be able to send the refresh cookie. It is safe because
    // the origin is on an exact allowlist: with `credentials: true` a wildcard
    // in `origin` would be a breach, and that is why one is never used here.
    credentials: true,
  });

  app.useGlobalPipes(
    new FieldValidationPipe({
      // Drops properties not declared in the DTO...
      whitelist: true,
      // ...and also rejects the request if they came. So if someone tries to
      // slip a `userId` into the body, it dies here and never reaches the service.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

/**
 * Helmet plus the one header it does not send, `Permissions-Policy`: the
 * camera captures receipts and the clipboard pastes screenshots, both from
 * our own pages only; everything else the app never asks for is switched off
 * so an injected script cannot ask either.
 */
function securityHeaders(): RequestHandler[] {
  const permissionsPolicy: RequestHandler = (_request, response, next) => {
    response.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  };

  return [
    helmet({
      hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      frameguard: { action: 'deny' },
      /**
       * CSP for the process that ALSO serves the SPA.
       *
       * Every permission below is here for a specific reason; none is
       * "just in case". Whatever does not appear is forbidden.
       */
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // `wasm-unsafe-eval` enables WebAssembly, which is what runs
          // Tesseract. Despite the name, it does NOT enable eval(): it is a
          // much narrower permission, created precisely so as not to have to
          // open 'unsafe-eval' entirely because of WASM.
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          // 'unsafe-inline' is required by the inline style Tailwind generates.
          // fonts.googleapis.com serves the Geist, Instrument Serif and JetBrains Mono stylesheet.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          // blob: for the previews of the images being imported.
          imgSrc: ["'self'", 'data:', 'blob:'],
          // Only to ourselves. The Have I Been Pwned lookup is made by the
          // SERVER, never the browser, so there is no need to open it here.
          connectSrc: ["'self'"],
          // Tesseract and pdf.js create their Web Workers from blobs.
          workerSrc: ["'self'", 'blob:'],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
    }),
    permissionsPolicy,
  ];
}

/** Origins allowed by CORS. An exact list, no wildcards, ever. */
export function parseOrigins(config: ConfigService): string[] {
  return (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
