// Configuración de la CLI de Prisma (Prisma 7). Va junto a `api/package.json`,
// que es desde donde se corre la CLI (ADR 0020).
//
// Prisma 7 ya no carga `.env` por su cuenta: lo hace `dotenv/config`, que lee
// el `.env` del directorio actual y NO pisa lo que ya esté definido. Por eso
// `dotenv -e .env.migrate -- prisma …` sigue ganando sobre `api/.env`.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Las migraciones van por la conexión directa (`DIRECT_URL`, el dueño del
// esquema) y, si no la hay, por `DATABASE_URL`: lo mismo que hacía `directUrl`
// en el datasource de Prisma 6. `prisma generate` no necesita ninguna, y el
// build del servidor la corre sin base: por eso el datasource es opcional.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
// Solo para `migrate diff --from-migrations` (scripts/nueva-migracion.sh): la
// base desechable donde se reproducen las migraciones. Antes era un flag.
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } } : {}),
});
