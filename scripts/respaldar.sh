#!/usr/bin/env bash
#
# Copia la base de producción a un archivo local.
#
# ── Por qué existe ───────────────────────────────────────────────────────────
# El plan gratuito de Supabase guarda respaldos por poco tiempo y no ofrece
# recuperación a un punto en el tiempo. Un respaldo propio, en un disco que
# controlás vos, es lo único que sobrevive a que alguien borre el proyecto por
# error o a que la cuenta se suspenda.
#
# ── Por qué --data-only no, y --schema-only tampoco ──────────────────────────
# Se vuelca TODO: esquema y datos. Un volcado de solo datos exige que exista ya
# una base idéntica para restaurarlo, y justo en el día en que hace falta el
# respaldo es cuando esa base no existe.
#
# ── Por qué no se comprime con la fecha en el nombre y basta ─────────────────
# Porque un respaldo que nunca se probó no es un respaldo. Al final el script
# lo restaura en una base local desechable y cuenta las filas: si ese paso
# falla, el archivo no sirve y es mejor saberlo hoy.
set -euo pipefail

cd "$(dirname "$0")/.."

DESTINO="${1:-respaldos}"
mkdir -p "$DESTINO"
FECHA=$(date +%Y%m%d-%H%M%S)
ARCHIVO_SQL="$DESTINO/coco-$FECHA.sql"

export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:$PATH"

command -v pg_dump >/dev/null || {
  echo "Falta pg_dump. Instalalo con: brew install postgresql@17" >&2
  exit 1
}

echo "▸ Volcando producción…"
# Por DIRECT_URL (session pooler): el transaction pooler no mantiene la sesión
# que pg_dump necesita para recorrer el catálogo de forma consistente.
#
# --schema=public NO es opcional. Sin él, el volcado arrastra las extensiones
# internas de Supabase (supabase_vault, pgsodium, pg_graphql) y el archivo solo
# se puede restaurar en otro Supabase: en un Postgres normal falla con
# "extension is not available". Las tablas de la aplicación viven todas en
# public; lo demás es plomería de la plataforma, que se rehace sola.
npx dotenv -e api/.env.supabase -- bash -c \
  "pg_dump \"\$DIRECT_URL\" --schema=public --no-owner --no-privileges --clean --if-exists" \
  > "$ARCHIVO_SQL"

TAMANO=$(du -h "$ARCHIVO_SQL" | cut -f1)
FILAS=$(grep -c "^INSERT\|^COPY" "$ARCHIVO_SQL" || true)
echo "   $ARCHIVO_SQL ($TAMANO)"

echo "▸ Probando la restauración en una base desechable…"
PRUEBA="coco_verificar_respaldo"
dropdb --if-exists "$PRUEBA" 2>/dev/null || true
createdb "$PRUEBA"
if psql -q -v ON_ERROR_STOP=1 -d "$PRUEBA" -f "$ARCHIVO_SQL" >/dev/null 2>&1; then
  TABLAS=$(psql -t -A -d "$PRUEBA" -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  USUARIOS=$(psql -t -A -d "$PRUEBA" -c "SELECT count(*) FROM users")
  dropdb "$PRUEBA"
  echo "   restauró $TABLAS tablas y $USUARIOS usuario(s)"
  echo ""
  echo "Respaldo verificado: $ARCHIVO_SQL"
else
  dropdb --if-exists "$PRUEBA" 2>/dev/null || true
  echo "" >&2
  echo "⚠️  El archivo se generó pero NO se pudo restaurar. No sirve como respaldo." >&2
  exit 1
fi

# Se conservan los 14 más recientes. Sin esto la carpeta crece sin límite y
# nadie se entera hasta que el disco se llena.
ls -1t "$DESTINO"/coco-*.sql 2>/dev/null | tail -n +15 | while read -r viejo; do
  rm -f "$viejo"
  echo "   (eliminado por antigüedad: $(basename "$viejo"))"
done
