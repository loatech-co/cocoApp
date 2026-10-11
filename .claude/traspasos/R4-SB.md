# R4-SB — seguridad, operación y respaldos de la ronda 4

Rama `fix/r4-security-backups`, integrada con `merge.sh`. Runbook y ADR 0033 al día.

- S9/S15: `sql-supabase.sh` pasa la cabecera por `curl -K -` (stdin), `-sS
--fail-with-body`, y sale 1 si curl falla o no hay respuesta.
- S10: `scripts/db/pg-env.mjs` reparte una URL en `PG*`; `extract.mjs`,
  `pull-data-to-local.sh`, `restore.sh` y `create-app-role.sh` sin URL en argv.
- S11: `deploy-migrations.sh` rechaza `--env-file` distinto de `.env.supabase`
  sin `--dry-run`, antes de `migrate status`.
- S12: `setupApiDocs(app, env)` decide con `isProduction`; `main.ts` lee
  `NODE_ENV`, `LOG_LEVEL` y `PORT` con `readEnv`.
- S13/B3: solo `coco-<yyyymmdd>-<hhmmss>.tar.age` vale como respaldo.
- S14: `sql-guard` juzga sin literales (DELETE/UPDATE con WHERE de su nivel,
  DROP/TRUNCATE, cuerpo de `DO`; distingue cláusulas). 11 casos en el spec.
- S16: `backup-from-server.sh` con array `SSH_CMD` y `-e` entrecomillado.
- S17: NO es defecto: `env.ts` ya valida `TRUST_PROXY_HOPS`; pruebas añadidas.
- B1/B2: `restore.sh` recrea los `ALTER DEFAULT PRIVILEGES` como el rol que
  conecta; `check-app-role.sql` cubre secuencias, esquemas, funciones y `pg_default_acl`.
- B4: rutas relativas resueltas desde donde se tecleó (`backup.sh`, `restore.sh`).

Ensayo local: respaldo verificado; USAGE revocado → falla y no deja archivo.
Pendiente: el primer `npm run backup` real ejercita la fila `public CREATE`
contra el `nspacl` de producción (remedio en runbook, «Restore»).
Borrado: `coco_e2e_r4sb_test`, `coco_r4sb_src_test`, claves/datos de ensayo, clon.
