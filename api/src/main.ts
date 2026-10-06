import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';

import { AppModule } from './app.module';
import { configureApp, parseOrigins } from './bootstrap';
import { whyTheEnvironmentIsInvalid } from './common/config/env';
import { whyRefuseToStart } from './common/env';
import { defaultLogDirectory, JsonLogger, parseLogLevel } from './common/logging/json-logger';
import { installSafetyNet } from './common/process/safety-net';
import { installBigIntSerializer } from './common/serialization/bigint';
import { CONTRACT_VERSIONS, docsPath, setupApiDocs } from './openapi/document';

/**
 * The API's startup.
 *
 * On Hostinger this runs as a Node.js Web App: a persistent process whose
 * entry is the compiled `dist/main.js`, not the TypeScript. Bootstrap happens
 * ONCE (and again after every restart), not per request — which is why
 * Prisma's connection pool stays alive between requests, precisely the
 * advantage of a long-lived process over the "one interpreter per request"
 * model.
 *
 * This same process also serves the built SPA (see SpaModule): one app, one
 * domain, no CORS and the session cookie as a first-party cookie.
 */
/**
 * Loads the app's `.env` BEFORE Nest builds anything, and gives it PRIORITY
 * over the variables already in the environment.
 *
 * This reverses the usual precedence, on purpose. In Hostinger's Node.js Web
 * App, LiteSpeed injects the variables set in hPanel when the process starts.
 * That configuration was filled in once, when the app was created, and it is
 * invisible from the repository and from SSH: there is no file to edit. When
 * the database moved from MariaDB to Postgres, hPanel kept injecting the old
 * `DATABASE_URL` and it always won —dotenv never overwrites an existing key—,
 * so the app connected to the wrong database or did not start.
 *
 * The symptom was misleading: Prisma failed with a P1012 that reads as if the
 * URL were mistyped ("the URL must start with postgresql://") when it was in
 * fact receiving, intact, the months-old MySQL URL.
 *
 * The path is ABSOLUTE, derived from __dirname (`api/dist`), so it does not
 * depend on the working directory the platform starts the process in.
 *
 * A consequence to keep in mind: changing the database no longer works from
 * hPanel; the `.env` file that ships with the deployment has to change.
 */
function loadConfiguration(): void {
  const file = join(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env');
  const { parsed } = loadDotenv({ path: file, override: true });
  if (!parsed) {
    Logger.warn(`No se encontró ${file}; se usan las variables del entorno.`, 'Bootstrap');
  }
  unquoteDatabaseUrls();
}

/**
 * Strips the quotes around a value inherited from the environment.
 *
 * LiteSpeed injects the Node.js App's variables as they were saved, quotes
 * included: `DATABASE_URL` arrives literally as `"postgresql://…"`, with the
 * quote inside the value. A `.env` file tolerates it because dotenv parses
 * quotes; an environment variable does not, and Prisma rejects the URL with a
 * P1012 that blames the protocol.
 *
 * While the deployment's `.env` exists, this changes nothing: that file
 * already won. It matters the day it is missing —a half-done deployment, a
 * file not copied— because then the inherited value is all that is left, and
 * this way it is at least usable instead of failing over a pair of quotes.
 */
function unquoteDatabaseUrls(): void {
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    const value = process.env[key];
    if (!value) continue;
    const unquoted = value.replace(/^(['"])(.*)\1$/s, '$2');
    if (unquoted !== value) {
      process.env[key] = unquoted;
      Logger.warn(`Se quitaron las comillas de ${key}, heredada del entorno.`, 'Bootstrap');
    }
  }
}

async function bootstrap(): Promise<void> {
  loadConfiguration();

  /*
    First of all: which database does this point at?

    It goes HERE, before `NestFactory.create`, because what has to be
    prevented is the connection. Checking later —in a module, in a guard—
    would be too late: Prisma connects when it is built, so the session
    against the remote database would already exist when the warning fired.

    And it exits with code 1, which is right for a startup that should not
    have happened. The code 0 further down is for something else: a Prisma
    panic while running, where LiteSpeed has to respawn without penalty.
  */
  // The environment is checked first, whole (step 7.4): one message listing
  // every missing or invalid variable instead of a crash at the first use.
  const blocker = whyTheEnvironmentIsInvalid() ?? whyRefuseToStart();
  if (blocker !== null) {
    new Logger('Bootstrap').error(blocker);
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
  const areDocsServed = setupApiDocs(app, config.get<string>('NODE_ENV'));

  // Closes Prisma cleanly when the host recycles the process.
  app.enableShutdownHooks();

  // Hostinger injects the port through an environment variable: never a fixed one.
  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');

  logger.log(`API escuchando en http://localhost:${port}/api/v1 y /api/v2`);
  if (areDocsServed) {
    for (const version of CONTRACT_VERSIONS) {
      logger.log(`API docs at http://localhost:${port}/${docsPath(version)}`);
    }
  }
  logger.log(`CORS permitido para: ${parseOrigins(config).join(', ') || '(ninguno)'}`);
}

void bootstrap();
