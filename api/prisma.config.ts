// The Prisma CLI's configuration (Prisma 7). It sits next to `api/package.json`,
// which is where the CLI runs from (ADR 0020).
//
// Prisma 7 no longer loads `.env` on its own: `dotenv/config` does, which reads
// the current directory's `.env` and does NOT override what is already set.
// That is why `dotenv -e .env.migrate -- prisma …` still wins over `api/.env`.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations go through the direct connection (`DIRECT_URL`, the schema's
// owner) and, if there is none, through `DATABASE_URL`: the same as
// `directUrl` did in Prisma 6's datasource. `prisma generate` needs neither,
// and the server's build runs it without a database: that is why the
// datasource is optional.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
// Only for `migrate diff --from-migrations` (scripts/new-migration.sh): the
// throwaway database where the migrations are replayed. It used to be a flag.
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } } : {}),
});
