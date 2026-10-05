#!/usr/bin/env bash
#
# Crea una migración de Prisma a partir del estado actual de schema.prisma.
#
# ── Por qué no se usa `prisma migrate dev` ───────────────────────────────────
# `migrate dev` exige un TTY interactivo para pedir el nombre de la migración,
# y falla en cualquier ejecución no interactiva. Aquí se hace lo mismo en dos
# pasos explícitos: generar el SQL con `migrate diff` y aplicarlo con
# `migrate deploy`.
#
# El SQL se genera a un archivo TEMPORAL y la carpeta de la migración se crea
# DESPUÉS. Al revés, `migrate diff --from-migrations` incluiría la carpeta
# vacía que se acaba de crear, produciría un script vacío y `migrate deploy`
# fallaría con P3006/P3018.
#
# ── Qué desapareció al pasar a Postgres ──────────────────────────────────────
# Este script filtraba los `MODIFY ... JSON` fantasma que MariaDB emitía en
# cada diff, porque allí `JSON` era un alias de `longtext` y Prisma veía una
# diferencia irresoluble. Postgres tiene `jsonb` de verdad: el fantasma ya no
# existe y el filtro se eliminó.
#
# ── Dónde se aplica ──────────────────────────────────────────────────────────
# Solo en la base LOCAL (.env.migrate). Llevarla a Supabase es un paso aparte
# y deliberado: scripts/desplegar-migraciones.sh
set -euo pipefail

NOMBRE="${1:-}"
if [ -z "$NOMBRE" ]; then
  echo "Uso: scripts/nueva-migracion.sh <nombre_en_snake_case>" >&2
  exit 1
fi

cd "$(dirname "$0")/../api"

SQL=$(mktemp)
trap 'rm -f "$SQL"' EXIT

# Prisma 7: la base desechable ya no va por flag (`--shadow-database-url`):
# `prisma.config.ts` la toma de SHADOW_DATABASE_URL, que trae .env.migrate.
# Y `--to-schema-datamodel` pasó a llamarse `--to-schema`.
grep -q '^SHADOW_DATABASE_URL=' .env.migrate || {
  echo "Falta SHADOW_DATABASE_URL en api/.env.migrate (ver .env.migrate.example)." >&2
  exit 1
}

npx dotenv -e .env.migrate -- npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema ./prisma/schema.prisma \
  --script > "$SQL"

if ! grep -qE '^(CREATE|ALTER|DROP|INSERT|UPDATE)' "$SQL"; then
  echo "No hay cambios que migrar: schema.prisma ya coincide con las migraciones."
  exit 0
fi

DIR="prisma/migrations/$(date +%Y%m%d%H%M%S)_${NOMBRE}"
mkdir -p "$DIR"
cp "$SQL" "$DIR/migration.sql"

echo "→ $DIR/migration.sql"
cat "$DIR/migration.sql"
echo ""

npx dotenv -e .env.migrate -- npx prisma migrate deploy
npx prisma generate >/dev/null
echo "Listo en local. Para llevarla a Supabase: scripts/desplegar-migraciones.sh"
