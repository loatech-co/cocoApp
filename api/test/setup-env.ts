import { config } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Loads `.env.test` BEFORE anything else, overriding whatever was there.
 *
 * Why this file exists: something may already have loaded `.env` (up to
 * Prisma 6, `@prisma/client` read it on import), and `ConfigModule` does NOT
 * overwrite variables that are already in `process.env`. The result is that,
 * without this, the tests inherit the DEVELOPMENT DATABASE_URL and the e2e
 * suite —which empties the tables— runs against the wrong database. It really
 * happened.
 *
 * `override: true` is the key: loading the file is not enough, it has to win
 * over the one already loaded.
 */
config({ path: resolve(__dirname, '..', '.env.test'), override: true, quiet: true });
