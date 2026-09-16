#!/usr/bin/env bash
#
# Copia los DATOS de Supabase a la base local, para trabajar sin tocar
# producción.
#
# ── Por qué existe ───────────────────────────────────────────────────────────
# Desarrollar contra Supabase significa que cada prueba —crear un movimiento,
# reclasificar una fila, borrar una categoría— cambia datos de verdad. Y
# desarrollar contra una base vacía significa que la mitad de las pantallas se
# ven como un estado vacío y los errores de datos reales no aparecen hasta el
# despliegue.
#
# ── Qué NO copia ─────────────────────────────────────────────────────────────
# El esquema. Ese lo pone Prisma con las migraciones, que es la fuente de
# verdad; copiarlo de la base viva dejaría la local desincronizada del
# repositorio sin que nadie se entere.
#
# Tampoco copia `auth.users` de Supabase: las credenciales viven allá y la API
# local habla con el mismo GoTrue. Se entra con el mismo correo y contraseña.
set -euo pipefail

cd "$(dirname "$0")/.."

# La URL de sesión (5432), no la de transacción (6543): pg_dump necesita una
# sesión estable y el pooler en modo transacción se la corta a la mitad.
ORIGEN=$(grep '^DIRECT_URL=' api/.env.supabase | sed 's/^DIRECT_URL=//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')
DESTINO=$(grep '^DATABASE_URL=' api/.env | sed 's/^DATABASE_URL=//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')

[ -n "$ORIGEN" ] || { echo "No encontré DIRECT_URL en api/.env.supabase" >&2; exit 1; }
[ -n "$DESTINO" ] || { echo "No encontré DATABASE_URL en api/.env" >&2; exit 1; }

case "$DESTINO" in
  *localhost*|*127.0.0.1*) ;;
  # Este script BORRA el destino antes de escribir. Si el destino no es local,
  # algo está mal configurado y no vale la pena averiguar qué.
  *) echo "El destino no es local. No se toca nada." >&2; exit 1 ;;
esac

# EN ORDEN DE DEPENDENCIA, y ese orden importa.
#
# `pg_dump --data-only` saca las tablas por orden alfabético, no por
# dependencia: `accounts` sale antes que `users` y su llave foránea no
# encuentra el usuario. La salida normal es `--disable-triggers`, pero eso
# exige ser superusuario en el destino y la base local no lo es. Así que se
# vuelca tabla por tabla y se restaura en el orden correcto.
TABLAS=(
  users
  accounts
  categories
  tags
  import_batches
  transactions
  transaction_splits
  transaction_tags
  import_rows
  category_rules
  user_preferences
  audit_log
)

LISTA=$(IFS=,; echo "${TABLAS[*]}")

echo "▸ Vaciando la base local…"
psql "$DESTINO" -q -c "TRUNCATE $LISTA RESTART IDENTITY CASCADE;"

echo "▸ Trayendo los datos de Supabase…"
VOLCADO=$(mktemp -t coco-datos)
trap 'rm -f "$VOLCADO"' EXIT

for t in "${TABLAS[@]}"; do
  pg_dump "$ORIGEN" --data-only --no-owner --no-privileges --table="public.$t" >> "$VOLCADO"
done

# Una sola transacción: si algo falla a medio camino, la base local se queda
# vacía y no a medias, que es peor que vacía porque parece que funcionó.
psql "$DESTINO" -q --single-transaction -v ON_ERROR_STOP=1 -f "$VOLCADO"

echo "▸ Comprobando…"
psql "$DESTINO" -q -c "
  SELECT 'movimientos' AS tabla, count(*) FROM transactions
  UNION ALL SELECT 'categorías', count(*) FROM categories
  UNION ALL SELECT 'usuarios', count(*) FROM users;"

echo "Listo. La API local ya tiene los mismos datos que producción."
