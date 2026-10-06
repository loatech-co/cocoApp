#!/usr/bin/env bash
#
# Restaura un respaldo de respaldar.sh y demuestra que volvió entero: cuenta
# las filas de cada tabla de `public` y `auth` y las compara con las que anotó
# el manifiesto al hacer el respaldo, y comprueba el sha256 de cada archivo del
# bucket.
#
# Uso:
#   bash scripts/restaurar.sh [respaldo]
#       Sin --target restaura en una base LOCAL desechable (coco_restore_test,
#       o $COCO_RESTORE_DB, que tiene que terminar en _restore_test), compara y
#       la borra. `respaldo` es un coco-<fecha>.tar.age o una carpeta ya
#       descifrada; por defecto, el más reciente de $COCO_DATA_DIR/respaldos.
#
#   bash scripts/restaurar.sh [respaldo] --target <url> [--i-know-this-is-production]
#       Restaura en otra base. Pide escribir el nombre de la base de destino,
#       letra por letra. Con producción se niega salvo que se pase además
#       --i-know-this-is-production. Restaurar en producción es una PARADA del
#       dueño (docs/runbook.md).
#
#       Si el destino es un Supabase, `auth` va solo con datos (el esquema es
#       de Supabase y ya existe) y tiene que estar vacío: es para un proyecto
#       nuevo. El bucket no se sube desde aquí: se descifra el respaldo a mano
#       (docs/runbook.md) y se sube con scripts/soportes/copy-to-storage.mjs.
set -euo pipefail

cd "$(dirname "$0")/.."

COCO_DATA_DIR="${COCO_DATA_DIR:-$HOME/Documents/VS Code/Personal/coco-datos}"
CLAVE_PRIVADA="${COCO_BACKUP_KEY:-${COCO_KEYS_DIR:-$HOME/.config/coco}/respaldo.key}"
ENV_FILE="${COCO_ENV_FILE:-api/.env.supabase}"
BASE_LOCAL="${COCO_RESTORE_DB:-coco_restore_test}"

export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:$PATH"

alto() {
  echo "$1" >&2
  exit 1
}

RESPALDO=""
DESTINO=""
ES_PRODUCCION_ACEPTADO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || alto "--target necesita una url."
      DESTINO="$2"
      shift 2
      ;;
    --i-know-this-is-production)
      ES_PRODUCCION_ACEPTADO=1
      shift
      ;;
    -*) alto "Opción desconocida: $1" ;;
    *)
      RESPALDO="$1"
      shift
      ;;
  esac
done

if [ -z "$RESPALDO" ]; then
  # El nombre lleva la fecha: el último en orden alfabético es el más nuevo.
  RESPALDO="$(find "$COCO_DATA_DIR/respaldos" -maxdepth 1 -name 'coco-*.tar.age' | sort | tail -1)"
  [ -n "$RESPALDO" ] || alto "No hay ningún coco-*.tar.age en $COCO_DATA_DIR/respaldos."
fi

# ── 1. El destino, antes de abrir nada ───────────────────────────────────────
nombre_de_la_base() { sed -E 's#^[a-z]+://[^/]*/([^?]*).*#\1#' <<<"$1"; }

ES_SUPABASE=0
if [ -z "$DESTINO" ]; then
  [[ "$BASE_LOCAL" == *_restore_test ]] || alto "La base local tiene que terminar en _restore_test (es: $BASE_LOCAL)."
  CONEXION="$BASE_LOCAL"
else
  BASE="$(nombre_de_la_base "$DESTINO")"
  [ -n "$BASE" ] || alto "No se pudo leer el nombre de la base en la url de --target."
  [[ "$DESTINO" == *supabase* ]] && ES_SUPABASE=1

  # Producción es la del ref de api/.env.supabase. Sin ese archivo no hay forma
  # de distinguirla, así que todo Supabase cuenta como producción.
  REF=""
  [ -f "$ENV_FILE" ] &&
    REF="$(grep -E '^SUPABASE_URL=' "$ENV_FILE" | sed -E 's#^[^/]*//([^.]+)\..*#\1#')"
  if { [ -n "$REF" ] && [[ "$DESTINO" == *"$REF"* ]]; } || { [ -z "$REF" ] && [ $ES_SUPABASE = 1 ]; }; then
    [ $ES_PRODUCCION_ACEPTADO = 1 ] ||
      alto "El destino es PRODUCCIÓN. Restaurar ahí es una parada del dueño; si lo es, añadí --i-know-this-is-production."
    echo "⚠️  Vas a SOBRESCRIBIR PRODUCCIÓN." >&2
  fi

  read -r -p "Escribí el nombre de la base de destino ($BASE) para confirmar: " CONFIRMACION </dev/tty
  [ "$CONFIRMACION" = "$BASE" ] || alto "No coincide. No se restauró nada."
  CONEXION="$DESTINO"
fi

# ── 2. Abrir el respaldo ─────────────────────────────────────────────────────
TEMPORAL="$(mktemp -d "${TMPDIR:-/tmp}/coco-restaurar.XXXXXX")"
chmod 700 "$TEMPORAL"
# Cleans up and keeps the exit status: bash 3.2 (the one macOS ships) can
# otherwise exit 0 after a failure when an EXIT trap runs.
limpiar() {
  local estado=$?
  rm -rf "$TEMPORAL"
  exit "$estado"
}
trap limpiar EXIT

if [ -d "$RESPALDO" ]; then
  CARPETA="$RESPALDO"
else
  command -v age >/dev/null || alto "Falta age. Instalalo con: brew install age"
  [ -f "$CLAVE_PRIVADA" ] || alto "Falta la clave privada en $CLAVE_PRIVADA (docs/runbook.md dice dónde está la copia)."
  echo "▸ Descifrando $(basename "$RESPALDO")…"
  age -d -i "$CLAVE_PRIVADA" "$RESPALDO" | tar -C "$TEMPORAL" -xf -
  CARPETA="$(find "$TEMPORAL" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi
for pieza in manifest.json conteos.tsv db.dump sumas.sha256; do
  [ -f "$CARPETA/$pieza" ] || alto "El respaldo no trae $pieza: no es un respaldo completo."
done

# ── 3. Los archivos del bucket ───────────────────────────────────────────────
echo "▸ Comprobando el sha256 de los archivos del bucket…"
ARCHIVOS=$(wc -l <"$CARPETA/sumas.sha256" | tr -d ' ')
if [ "$ARCHIVOS" -gt 0 ]; then
  (cd "$CARPETA" && shasum -a 256 -c --quiet sumas.sha256) ||
    alto "Hay archivos del bucket dañados o ausentes."
fi
echo "   $ARCHIVOS archivos íntegros"

# ── 4. Restaurar ─────────────────────────────────────────────────────────────
if [ -z "$DESTINO" ]; then
  echo "▸ Restaurando en la base local desechable ${BASE_LOCAL}…"
  dropdb --if-exists "$BASE_LOCAL"
  createdb "$BASE_LOCAL"
else
  echo "▸ Restaurando en ${BASE}…"
fi
INICIO=$SECONDS
# --clean también en una base recién creada: desde Postgres 15 toda base nace
# con un esquema `public`, y el CREATE SCHEMA del volcado chocaría con él.
RESTAURAR=(pg_restore --no-owner --no-privileges --exit-on-error -d "$CONEXION")
if [ -n "$DESTINO" ] && [ $ES_SUPABASE = 1 ]; then
  "${RESTAURAR[@]}" --schema=auth --data-only "$CARPETA/db.dump"
  "${RESTAURAR[@]}" --schema=public --clean --if-exists "$CARPETA/db.dump"
else
  "${RESTAURAR[@]}" --clean --if-exists "$CARPETA/db.dump"
fi
echo "   restaurado en $((SECONDS - INICIO)) s"

# ── 5. Contar ────────────────────────────────────────────────────────────────
echo "▸ Contando filas…"
psql -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 -d "$CONEXION" >"$TEMPORAL/restaurado.tsv" <<'SQL'
SELECT format('SELECT %L, count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'auth') AND c.relkind IN ('r', 'p') AND NOT c.relispartition
ORDER BY 1 \gexec
SQL

# Se comparan las tablas del manifiesto: un Supabase más nuevo puede traer
# tablas de `auth` que el respaldo no tenía, y eso no es una pérdida.
set +e
awk -F'\t' '
  NR == FNR { restored[$1] = $2; next }
  !($1 in restored) { print "   falta la tabla " $1; bad = 1; next }
  restored[$1] != $2 { print "   " $1 ": respaldo " $2 ", restaurado " restored[$1]; bad = 1; next }
  { tables++; rows += $2 }
  END { if (!bad) print "   " tables " tablas y " rows " filas, iguales al manifiesto"; exit bad }
' "$TEMPORAL/restaurado.tsv" "$CARPETA/conteos.tsv"
IGUALES=$?
set -e

[ -z "$DESTINO" ] && dropdb "$BASE_LOCAL"

if [ $IGUALES -ne 0 ]; then
  alto "Los conteos NO coinciden con el manifiesto: la restauración no está completa."
fi
echo "Restauración verificada."
