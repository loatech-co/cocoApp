import { config } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Carga `.env.test` ANTES que cualquier otra cosa, pisando lo que ya hubiera.
 *
 * Por qué existe este archivo: `@prisma/client` lee `.env` al importarse, y
 * `ConfigModule` NO sobrescribe variables que ya estén en `process.env`. El
 * resultado es que, sin esto, las pruebas heredan la DATABASE_URL de
 * DESARROLLO y la suite e2e —que vacía las tablas— corre contra la base
 * equivocada. Pasó de verdad.
 *
 * `override: true` es la clave: no basta con cargar el archivo, hay que ganarle
 * al que ya se cargó.
 */
config({ path: resolve(__dirname, '..', '.env.test'), override: true, quiet: true });
