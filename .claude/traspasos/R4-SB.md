# R4-SB — seguridad, operación y respaldos de la ronda 4

Rama `fix/r4-security-backups`, integrada con `merge.sh`. Runbook y ADR 0033 al día.

- S9/S15: `sql-supabase.sh` pasa la cabecera por `curl -K -` (stdin, nada en
  argv), `-sS --fail-with-body`, y sale 1 si curl falla o no hay respuesta.
- S10: `scripts/db/pg-env.mjs` (con spec) reparte una URL en `PG*`;
  `extract.mjs`, `pull-data-to-local.sh`, `restore.sh` (`--target`) y
  `create-app-role.sh` ya no llevan la URL en argv.
- S11: `deploy-migrations.sh` rechaza `--env-file` distinto de `.env.supabase`
  sin `--dry-run`, antes de `migrate status` (probado con env local).
- S12: `setupApiDocs(app, env)` decide con `isProduction`; `main.ts` lee
  `NODE_ENV`, `LOG_LEVEL` y `PORT` con `readEnv`; `defaultLogDirectory` igual.
  Pruebas con comillas en `document.spec.ts` y `json-logger.spec.ts`.
- S13/B3: solo `coco-<yyyymmdd>-<hhmmss>.tar.age` vale como respaldo
  (`deploy-migrations.sh`, `restore.sh`); `-incompleto` y `.partial` quedan fuera.
- S14: `sql-guard` juzga sin literales: DELETE/UPDATE en cualquier posición
  con WHERE de su propio nivel, DROP/TRUNCATE en cualquier posición, cuerpo
  de `DO`; distingue cláusulas (`ON DELETE`, `FOR UPDATE`, `DO UPDATE`,
  `GRANT`). 11 casos en el spec.
- S16: `backup-from-server.sh` con array `SSH_CMD` y `-e` entrecomillado
  para rsync (comillas dobladas, no barras).
- S17: NO es defecto: `env.ts` valida `TRUST_PROXY_HOPS` con `^\d$` y
  `main.ts:103` aborta el arranque; pruebas añadidas en `env.spec.ts`.
- B1/B2: `restore.sh` recrea los `ALTER DEFAULT PRIVILEGES` como el rol que
  conecta y el chequeo (`scripts/restore/check-app-role.sql`) cubre
  secuencias, USAGE/CREATE de esquemas, EXECUTE de funciones y `pg_default_acl`.
- B4: rutas relativas resueltas desde donde se tecleó (`backup.sh`, `restore.sh`).

Ensayo local (`coco_r4sb_src_test`, claves y datos en el clon, bucket vacío):
respaldo verificado; USAGE revocado → falla y no deja archivo; rutas relativas.
Pendiente: el primer `npm run backup` real ejercita la fila `public CREATE`
contra el `nspacl` de producción (remedio en runbook, «Restore»).
Borrado: `coco_e2e_r4sb_test`, `coco_r4sb_src_test`, claves/datos de ensayo, clon.
