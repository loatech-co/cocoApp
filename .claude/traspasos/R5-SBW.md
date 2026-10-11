# R5-SBW — scripts, respaldos y web de la ronda 5

Rama `fix/r5-scripts-backups-web` (desde `origin/Dev`), integrada con `merge.sh`. Hallazgos S18–S21, B1–B5 y W1–W4 de `ronda-5-2026-10-11.md`.

## Hecho

- **B1 (alto)**: `check-app-role.sql` resuelve las cuatro funciones con `to_regprocedure` en un CTE `executes` y `coalesce(…, false)`: una función narrowed que falta pasa; una concedida que falta se reporta. Ensayo local (`coco_r5sbw_src_test`, carpeta de respaldo a mano, `restore.sh` sin `--target`): con todas las migraciones → 0; sin J-5 (trigger, función y fila de `_prisma_migrations` fuera) → 0, y el SQL de `origin/Dev` revienta con `function … does not exist`; sin J-5 y `USAGE` de `app_private` revocado → 1 nombrando `no app_private USAGE`; con J-5 y `EXECUTE` concedido → 1 nombrando `guard_users_access EXECUTE`.
- **B3**: dos filas más: `a public table without forced RLS` y `policies <> N`; `N` sale de `scripts/db/expected-policies.sh`, que ahora comparten `verify-data-api-closed.sh` y `restore.sh` (ensayo: tabla sin FORCE y política borrada → 1 nombrando ambas).
- **S18/B5**: `--target` ya no lleva URL: la lee de `COCO_RESTORE_TARGET_URL` (o `--target NOMBRE`) y la entrega a `pg-env.mjs` con asignación de prefijo, sin `export`. Una URL en argv para con mensaje.
- **S19**: `verify-data-api-closed.sh --local` y `setup-local-db.sh` conectan por `PG*` (`pg-env.mjs`), nada en argv; `setup-local-db.sh` probado de nuevo (idempotente).
- **S20**: `sql-guard` lee `E'…'` con `\'` mediante `quotedAt()` (una `E` pegada a una palabra, `LIKE'x'`, no es prefijo); caso en el spec.
- **S21/B2**: `deploy-migrations.sh` elige el respaldo más nuevo por nombre (`find | sort`, como `restore.sh`) y resuelve `--backup` relativo desde donde se tecleó (probado desde otra carpeta con `--dry-run`).
- **B4**: runbook, «Restore»: con `--target` se conecta como el rol que ejecutará las migraciones.
- **W1**: `shouldRetry` reintenta `status === 0`; prueba. **W2**: comentario de `requestSession` al día con `renew()` de R3-W2 (no se separaron razones). **W3**: `scripts/lint/spanish-markup.spec.ts` (6 casos, sondas en inglés para que `lint:spanish` no las marque); `npm test` corre `scripts/**/*.spec.{mjs,ts}` con `node --import tsx`. `node.arguments[0]!` NO revienta: la línea 110 exige `arguments.length > 0` (hay caso que lo prueba). **W4**: tachado en `R4-W.md`.
- Runbook y ADR 0033 al día. (La rotura de `bridge.contract.test.ts` por R4-I apareció aquí, pero `Dev` ya la traía corregida en `f33593ca`.)

## Verificación

typecheck, lint (+ `lint:spanish`), prettier, knip, depcruise, unitarias 17+57+519+848+27, e2e API 344/344 (`coco_e2e_r5sbw_test`), build, instalación limpia, Playwright 38/38 (4370/4371, `coco_e2e_pw_r5sbw_test`).

## Pendiente

- El primer `npm run backup` real sigue siendo la primera ejecución de la fila `public CREATE` (R4-SB) y de las filas RLS contra producción.
- El ensayo no pasó por `backup.sh`/`extract.mjs` (no hay `storage.objects` ni `auth` en local): la carpeta descifrada se montó a mano con `pg_dump -Fc --no-owner` y `conteos.tsv`.

## Borrado

Bases `coco_r5sbw_src_test`, `coco_e2e_r5sbw_test`, `coco_e2e_pw_r5sbw_test`; clon `cocoApp-work/r5-sbw` y archivos `r5sbw-*` de `cocoApp-work/tmp`.
