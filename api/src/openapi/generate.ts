import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTRACT_VERSIONS, createOpenApiDocument } from './document';
import { AppModule } from '../app.module';
import { configureRouting } from '../bootstrap';

/**
 * Writes `api/openapi.v<n>.json` (today only v2) from the compiled
 * API (`npm run openapi`), one document per contract version.
 *
 * The app is built in PREVIEW mode: Nest resolves the module graph and reads
 * every controller's metadata, but instantiates no provider. Nothing connects
 * to a database, nothing reads a secret, and the environment can be empty —
 * which is what lets CI regenerate the documents and compare them with the
 * ones committed.
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
  configureRouting(app);

  const directory = process.argv[2] ?? join(__dirname, '..', '..');
  for (const version of CONTRACT_VERSIONS) {
    const document = createOpenApiDocument(app, version);
    writeFileSync(
      join(directory, `openapi.v${version}.json`),
      `${JSON.stringify(document, null, 2)}\n`,
    );
  }
  await app.close();
}

void generate();
