// The Prisma client for the operational scripts (`npm run sql`, `seed:local`,
// `cargar`, `soportes:importar`), on the same generated client as the API.
//
// Prisma 7 generates the client as TypeScript into api/src/generated/prisma
// (ADR 0020), so these scripts run under `tsx`, not plain `node`. The client is
// CommonJS: its named exports are not visible to an ES module import, hence the
// default import. And Prisma 7 has no built-in engine: every client needs the
// `pg` driver adapter, pointed at the same DATABASE_URL the scripts always used.
import { PrismaPg } from '@prisma/adapter-pg';

import generated from '../../api/src/generated/prisma/client.ts';

/** A client on `DATABASE_URL`, which `dotenv -e` injects into the process. */
export function createPrisma() {
  return new generated.PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}
