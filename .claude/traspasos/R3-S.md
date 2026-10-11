# R3-S — seguridad, CI y scripts de operación de la ronda 3

Rama `fix/r3-security-ops`, integrada con `merge.sh`.

Hecho:

- S1/B5: `deploy-migrations.sh` exige un `coco-*.tar.age` en
  `$COCO_DATA_DIR/respaldos` (o `--backup <archivo>`) con menos de 24 h
  (`MAX_BACKUP_AGE_HOURS`) y termina con `verify-data-api-closed.sh`, que sale
  1 si los contadores de `check-data-api.sql` no son 0/0/14/0 (incluye FORCE).
  `--dry-run` y `--env-file` para ensayar contra local (hecho contra
  `coco_dev_shadow`: sin respaldo → 1, viejo → 1, fresco → 0). Runbook al día.
- S2: `backup-from-server.sh` lee `COCO_LEGACY_SSH_TARGET`/`_KEY`/`_PORT` y
  falla si faltan; se conserva porque el disco del servidor sigue siendo el
  respaldo de los soportes hasta que el dueño lo retire. `env.spec.ts` con ruta
  neutra. Para el filter-repo: usuario y host del hosting antiguo, ver el
  script en el historial (líneas 20-22 antes de este paso).
- S3: `sql-supabase.sh` sin ref por defecto: `SUPABASE_PROJECT_REF`, o lo deriva
  de `SUPABASE_URL` (entorno o `api/.env.supabase`); si no, sale 1.
- S4: gitleaks con sha256 en `security.yml`, igual que `ci.yml`.
- S5: `trustProxyHops()`/`logsProxyHeaders()` leen con `readEnv`; el
  controlador de auth usa `isProduction()`. Prueba con comillas en
  `client-ip.spec.ts`.
- S6: `api/.soportes-test/` y `e2e/.salida/` en `.gitignore` (borrarlas del
  checkout principal es del director).
- S7: `scripts/sql-guard.mjs` juzga cada sentencia sin comentarios;
  `sql-guard.spec.mjs` con `node --test`, enganchado a `npm test`.
- S8: `create-app-role.sh` reparte `ADMIN_DATABASE_URL` en `PG*` desde el
  entorno; nada en argv. `PGDATABASE` con URI no sirve: libpq no la expande.

Pendiente: `main.ts` sigue leyendo `NODE_ENV` con `config.get` para los docs
(fuera del alcance de S5). Borrado: `coco_e2e_r3s_test` y el clon de trabajo.
