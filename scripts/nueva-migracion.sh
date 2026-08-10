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
# ── El fantasma de MariaDB ───────────────────────────────────────────────────
# MariaDB no tiene tipo JSON nativo: `JSON` es un alias de
# `longtext CHECK (json_valid(...))`, y `information_schema` reporta `longtext`.
# Prisma compara su `Json` contra ese `longtext`, ve una diferencia y emite un
# `MODIFY ... JSON` en CADA diff. Aplicarlo no cambia nada — comprobado: tras
# el ALTER, MariaDB sigue reportando `longtext`.
#
# Es una diferencia irresoluble, no un error. Se filtra aquí para que las
# migraciones nuevas no arrastren ALTERs que no hacen nada y que, con el
# tiempo, esconderían un cambio de verdad entre el ruido.
set -euo pipefail

NOMBRE="${1:-}"
if [ -z "$NOMBRE" ]; then
  echo "Uso: scripts/nueva-migracion.sh <nombre_en_snake_case>" >&2
  exit 1
fi

cd "$(dirname "$0")/../api"

SHADOW=$(grep SHADOW_DATABASE_URL .env.migrate | cut -d'=' -f2- | tr -d '"')
SQL=$(mktemp)

npx dotenv -e .env.migrate -- npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "$SHADOW" \
  --script > "$SQL"

# Fuera el fantasma: los MODIFY ... JSON sobre columnas que MariaDB ya guarda
# como longtext, y el encabezado "-- AlterTable" que se queda huérfano cuando su
# única sentencia era justamente esa.
FILTRADO=$(mktemp)
python3 - "$SQL" > "$FILTRADO" <<'PY'
import re, sys

sql = open(sys.argv[1]).read()

# 1. Fuera las sentencias fantasma.
sql = re.sub(r'^ALTER TABLE `[^`]+` MODIFY `[^`]+` JSON[^;]*;\n?', '', sql, flags=re.M)
# 2. Fuera el ALTER que quedó sin columnas que modificar.
sql = re.sub(r'^ALTER TABLE `[^`]+`;\n?', '', sql, flags=re.M)
# 3. Fuera el encabezado que ya no encabeza nada.
sql = re.sub(r'-- AlterTable\s*(?=(-- |\Z))', '', sql)
# 4. Una sola línea en blanco entre bloques.
sql = re.sub(r'\n{3,}', '\n\n', sql).strip()

print(sql)
PY

if ! grep -qE '^(CREATE|ALTER|DROP|INSERT|UPDATE)' "$FILTRADO"; then
  echo "No hay cambios que migrar: schema.prisma ya coincide con las migraciones."
  rm -f "$SQL" "$FILTRADO"
  exit 0
fi

DIR="prisma/migrations/$(date +%Y%m%d%H%M%S)_${NOMBRE}"
mkdir -p "$DIR"
mv "$FILTRADO" "$DIR/migration.sql"
rm -f "$SQL"

echo "→ $DIR/migration.sql"
cat "$DIR/migration.sql"
echo ""

npx dotenv -e .env.migrate -- npx prisma migrate deploy
npx prisma generate >/dev/null
echo "Listo. Cliente de Prisma regenerado."
