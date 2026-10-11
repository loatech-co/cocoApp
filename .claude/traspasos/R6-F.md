# R6-F — scripts, CI y API de la ronda 6 (cierre J)

Rama `fix/r6-final` (desde `origin/Dev`), integrada con `merge.sh`. Hallazgos S22/B1, S23, S24, S25, B2, B3 y A1 de `ronda-6-2026-10-11.md`. Los siete eran defectos reales.

## Hecho

- **S22/B1**: `deploy-migrations.sh` mide la edad del respaldo desde el sello del nombre (`coco-YYYYMMDD-HHMMSS`, hora local como la escribe `backup.sh`), parseado en node (portable macOS/Linux); el mtime ya no cuenta. Ensayo con `--dry-run --env-file` contra una base local vacía y `COCO_DATA_DIR` propio: nombre de hace 10 días con mtime de ahora → rechaza (también con `--backup` explícito); nombre de ahora y de hace 23 h → pasa; 25 h → rechaza.
- **S23**: `pull-data-to-local.sh` ya no exporta `SOURCE`/`TARGET`: cada URL llega a `pg-env.mjs` por asignación de prefijo. Ensayo entre dos bases locales con shims de `pg_dump`/`psql` que volcaron su entorno: 16 hijos, ninguno con `SOURCE`, `TARGET` ni `postgresql://`; cada lado solo con sus `PG*`.
- **S24**: `restore.sh` hace `unset` de la variable de la URL tras leerla y, con `--target`, pasa la contraseña por `PGPASSFILE` 0600 (`*:*:*:*:pw`, `\` y `:` escapados por expansión de bash, sin hijos) en el workdir; `PGPASSWORD` se borra. Workdir y trap pasan antes del paso 1. Ensayo real con `expect` contra una base local vacía y respaldo montado a mano desde la base e2e: «Restore verified.»; shim de `node`: solo `pg-env.mjs` ve la URL, `filter-privileges.mjs` no ve ni URL ni `PGPASSWORD` y sí `PGPASSFILE` (0600). Comentarios, ADR 0033 y runbook al día. El clúster local es `trust`, así que la lectura del `.pgpass` por libpq no se ejercitó contra un servidor que exija contraseña (el formato es el documentado).
- **S25**: `# shellcheck shell=bash`; `shellcheck scripts/*.sh scripts/db/*.sh` limpio.
- **B2**: tres filas (`users.status`, `users.approved_at`, `users.approved_by_id` UPDATE). Contra la base e2e: vacío; con `GRANT UPDATE (status)` nombra `users.status UPDATE`; con las otras dos, las nombra.
- **B3**: paso de CI tras `db:test:push`: `verify-data-api-closed.sh --local TEST_DATABASE_URL` (modo `--local NAME` nuevo) y `scripts/db/verify-app-role.sh TEST_DATABASE_URL` (nuevo; mismo SQL que el paso 7 de `restore.sh`). URL siempre por nombre de variable y `pg-env.mjs`. Decisión: `--local` tolera `_prisma_migrations` sin RLS, y solo esa tabla (la enciende `close-data-api.sql`, que solo corre en producción; antes `--local` siempre salía en rojo por ella). Ensayo: base migrada → 0; copia con una política borrada → ambos fallan nombrándola; más una tabla sin RLS → `tables_without_rls=2`, `unforced=1`, «a public table without forced RLS». URL en argv → rechazada.
- **A1**: `@IsISO8601({ strict: true })` en los dos `capturedAt`; caso e2e (capture y POST /transactions con `2026-02-30T10:00:00Z` → 400 nombrando `capturedAt`); contraprueba sin `strict`: 200. Contrato y cliente regenerados sin cambios.

## Verificación

typecheck, lint (+ `lint:spanish`), prettier, knip, depcruise, shellcheck, unitarias 17+57+519+848+27, e2e API 347/347 (`coco_e2e_r6f_test`), build, instalación limpia.

## Pendiente

- El paso 7 de `restore.sh` sigue con su `psql` en línea en vez de llamar a `verify-app-role.sh` (ya ensayado en R5; unificar es cosmético).
- CI corre el paso B3 por primera vez en este PR: si el runner no trajera `psql`, instalarlo en el job.

## Borrado

Bases `coco_e2e_r6f_test`, `coco_r6f_broken_test`, `coco_r6f_deploy_test`, `coco_r6f_src_test`, `coco_r6f_tgt_test`, `coco_r6f_restore_tgt_test`; `api/.env.r6f-deploy`; archivos `r6f-*` de `cocoApp-work/tmp`; clon `cocoApp-work/r6-f`.
