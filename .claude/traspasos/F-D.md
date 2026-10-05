# F + D — modo de trabajo y limpieza inmediata (rama `chore/working-mode-and-cleanup`, sin push)

## Hecho

- F: «Modo de trabajo» arriba en `CLAUDE.md`; agente `.claude/agents/ejecutor-de-paso.md`; comando
  `/paso <id>`; `.claude/traspasos/` con README y 7.5; bloques A–G en `docs/plan-completo.md`.
- D: `datos/` (2 archivos, 30.203 B) y `respaldos/` (472 archivos, 33.841.400 B) MOVIDOS a
  `~/Documents/VS Code/Personal/coco-datos/` (700); manifiesto nombre+tamaño idéntico antes y después.
- Scripts leen `COCO_DATA_DIR` (por defecto esa ruta): `scripts/data-dir.mjs`, `respaldar.sh`,
  `soportes/backup-from-server.sh`, `soportes/{piloto,importar,reporte,copy-to-storage}`. Fuera de los
  ignores las entradas `datos/`, `respaldos/`, `AUDITORIA_RESPUESTAS.md`.
- Fix: `lefthook.yml` cita `"{1}"` en commitlint (en un worktree la ruta lleva espacio y fallaba todo commit).

## Borrado

- `AUDITORIA_RESPUESTAS.md` (no versionado) del checkout principal; el plan ya no lo cita.
- `eslint.config 2.js` ya no existía; ningún otro «* 2» fuera de `node_modules` y `.git/objects` (no tocados).

## Respaldos (nada borrado) — propuesta

- CONSERVAR: `mariadb-final.sql` (15 sep, último volcado de MariaDB, histórico único),
  `coco-20261005-121603.sql` (5 oct) y `soportes-20261005-121629/` (468 recibos).
- Borrables: `coco-20260915-121502.sql` (15 sep, Postgres temprano, superado) y
  `supabase-20260915-221412.sql` (15 sep, 51 tablas con esquemas internos de Supabase, previo a `--schema=public`).
- Política para el runbook: los 14 diarios más recientes (ya lo hace `respaldar.sh`) + el último de cada mes
  durante 12 meses + SIEMPRE el último antes de cada migración destructiva o contracción, sin caducar.
- Pendiente: confirmar en qué paso entra A (puse 7.13). `datos/LEEME.md` (fuera del repo) ya apunta a `$COCO_DATA_DIR`.
