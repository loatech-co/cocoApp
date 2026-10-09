#!/usr/bin/env bash
#
# Respaldo COMPLETO de producción, cifrado, fuera del portátil y probado.
#
# ── Qué lleva ────────────────────────────────────────────────────────────────
#   - el esquema `public`: esquema y datos, la aplicación entera;
#   - el esquema `auth` de Supabase: usuarios, identidades y sesiones. Sin él,
#     restaurar `public` devuelve los datos de unas cuentas con las que nadie
#     puede entrar;
#   - el bucket privado `soportes`, objeto por objeto, cada uno verificado por
#     sha256 contra `soportes.huella`;
#   - un manifiesto con las filas de cada tabla, contadas en la MISMA foto de
#     la base que el volcado (scripts/backup/extract.mjs explica por qué).
#
# ── Por qué el plan gratuito no alcanza ──────────────────────────────────────
# Supabase gratis guarda respaldos poco tiempo, sin recuperación a un punto en
# el tiempo, y no respalda el bucket. Un respaldo propio, en un disco que
# controlás vos, es lo único que sobrevive a que alguien borre el proyecto por
# error o a que la cuenta se suspenda.
#
# ── Solo lectura ─────────────────────────────────────────────────────────────
# Lee producción con api/.env.supabase dentro de una transacción READ ONLY y
# baja el bucket con GET. No escribe nada allá.
#
# ── Cifrado ──────────────────────────────────────────────────────────────────
# Con age (https://age-encryption.org), a la clave PÚBLICA de
# ~/.config/coco/respaldo.pub (o $COCO_BACKUP_RECIPIENT). Para cifrar no hace
# falta la privada; para restaurar, sí. Dónde la guarda el dueño:
# docs/runbook.md, «Backups and restore».
#
# ── Dónde queda ──────────────────────────────────────────────────────────────
# $COCO_DATA_DIR/respaldos/coco-<fecha>.tar.age (por defecto
# ~/Documents/VS Code/Personal/coco-datos/respaldos). Documents está bajo
# iCloud Drive: ese es el «fuera del portátil». Lo que se sube es SOLO el
# archivo cifrado; la copia en claro se arma en una carpeta temporal privada
# y se borra al terminar.
#
# ── Probado o no es un respaldo ──────────────────────────────────────────────
# Al final restaura el archivo cifrado en una base local desechable con
# scripts/restore.sh, y compara las filas de cada tabla con el manifiesto.
#
# Uso: npm run backup [-- <carpeta de destino>]
set -euo pipefail

cd "$(dirname "$0")/.."

COCO_DATA_DIR="${COCO_DATA_DIR:-$HOME/Documents/VS Code/Personal/coco-datos}"
DESTINO="${1:-$COCO_DATA_DIR/respaldos}"
ENV_FILE="${COCO_ENV_FILE:-api/.env.supabase}"
CLAVES="${COCO_KEYS_DIR:-$HOME/.config/coco}"
CLAVE_PRIVADA="${COCO_BACKUP_KEY:-$CLAVES/respaldo.key}"

export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:$PATH"

falta() {
  echo "Falta $1. $2" >&2
  exit 1
}
command -v pg_dump >/dev/null || falta pg_dump "Instalalo con: brew install postgresql@17"
command -v age >/dev/null || falta age "Instalalo con: brew install age"
[ -f "$ENV_FILE" ] || falta "$ENV_FILE" "Es el que trae las credenciales de producción."

# ── El destinatario del cifrado ──────────────────────────────────────────────
if [ -n "${COCO_BACKUP_RECIPIENT:-}" ]; then
  DESTINATARIO="$COCO_BACKUP_RECIPIENT"
elif [ -f "$CLAVES/respaldo.pub" ]; then
  DESTINATARIO="$(cat "$CLAVES/respaldo.pub")"
elif [ -f "$CLAVE_PRIVADA" ]; then
  DESTINATARIO="$(age-keygen -y "$CLAVE_PRIVADA")"
else
  falta "la clave de cifrado" "Creala con:
  mkdir -p \"$CLAVES\" && chmod 700 \"$CLAVES\"
  age-keygen -o \"$CLAVE_PRIVADA\" && chmod 600 \"$CLAVE_PRIVADA\"
  age-keygen -y \"$CLAVE_PRIVADA\" > \"$CLAVES/respaldo.pub\"
y guardá una copia de la privada donde dice docs/runbook.md."
fi

mkdir -p "$DESTINO"
FECHA=$(date +%Y%m%d-%H%M%S)
NOMBRE="coco-$FECHA"
ARCHIVO="$DESTINO/$NOMBRE.tar.age"

# La copia en claro, en una carpeta temporal solo nuestra (nunca en iCloud).
TEMPORAL="$(mktemp -d "${TMPDIR:-/tmp}/coco-respaldo.XXXXXX")"
chmod 700 "$TEMPORAL"
limpiar() {
  local estado=$?
  rm -rf "$TEMPORAL"
  rm -f "$ARCHIVO.parcial"
  exit "$estado"
}
trap limpiar EXIT
EN_CLARO="$TEMPORAL/$NOMBRE"

INICIO=$SECONDS
echo "▸ Extrayendo producción (solo lectura)…"
npx dotenv -e "$ENV_FILE" -- node scripts/backup/extract.mjs --out "$EN_CLARO"

echo "▸ Cifrando con age…"
tar -C "$TEMPORAL" -cf - "$NOMBRE" | age -r "$DESTINATARIO" -o "$ARCHIVO.parcial"
chmod 600 "$ARCHIVO.parcial"
mv "$ARCHIVO.parcial" "$ARCHIVO"
echo "   $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

echo "▸ Probando la restauración…"
if [ -f "$CLAVE_PRIVADA" ]; then
  # Prueba lo que de verdad quedó guardado: el archivo cifrado.
  bash scripts/restore.sh "$ARCHIVO"
else
  # Sin la privada en este equipo no se puede descifrar. Se prueba la copia
  # en claro, y se avisa: que el cifrado se abra queda sin demostrar.
  bash scripts/restore.sh "$EN_CLARO"
  echo "⚠️  La clave privada no está en $CLAVE_PRIVADA: se probó la copia en claro, no el archivo cifrado." >&2
fi

# ── ¿Está fuera del portátil? ────────────────────────────────────────────────
# Documents se sincroniza con iCloud Drive si la carpeta pertenece al
# proveedor de archivos de iCloud. Se avisa, no se falla: la subida es
# asíncrona y puede tardar.
en_icloud() {
  local carpeta
  carpeta="$(cd "$1" && pwd -P)"
  while [ "$carpeta" != "/" ]; do
    if xattr -p com.apple.file-provider-domain-id "$carpeta" 2>/dev/null | grep -q CloudDocs; then
      return 0
    fi
    carpeta="$(dirname "$carpeta")"
  done
  return 1
}
if en_icloud "$DESTINO"; then
  echo "   destino bajo iCloud Drive: se sube solo"
else
  echo "⚠️  $DESTINO NO está bajo iCloud Drive: el respaldo sigue solo en este equipo." >&2
fi

echo ""
echo "Respaldo completo y probado: $ARCHIVO ($((SECONDS - INICIO)) s)"

# No backup is deleted here. The retention policy is a proposal awaiting the
# owner (docs/runbook.md, "Backups and restore").
echo "   ($(find "$DESTINO" -maxdepth 1 -name 'coco-*' -type f | wc -l | tr -d ' ') backups in $DESTINO)"
