import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createOpenApiDocument } from './document';
import { AppModule } from '../app.module';
import { API_PREFIX } from '../bootstrap';

/**
 * Writes `api/openapi.json` from the compiled API (`npm run openapi`).
 *
 * The app is built in PREVIEW mode: Nest resolves the module graph and reads
 * every controller's metadata, but instantiates no provider. Nothing connects
 * to a database, nothing reads a secret, and the environment can be empty —
 * which is what lets CI regenerate the document and compare it with the one
 * committed.
 *
 * It runs from `dist/`, never through ts-node: the Swagger CLI plugin that
 * reads the DTO types and comments only runs inside `nest build`.
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix(API_PREFIX);

  const document = createOpenApiDocument(app);
  const target = process.argv[2] ?? join(__dirname, '..', '..', 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void generate();
