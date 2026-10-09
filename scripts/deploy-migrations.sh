#!/usr/bin/env bash
#
# Aplica las migraciones pendientes a Supabase (producción).
#
# ── Por qué es un script aparte y no el final de new-migration.sh ──────────
# Porque tocar producción tiene que ser un acto deliberado. Encadenarlo a la
# creación de la migración haría que un `migrate diff` exploratorio —de esos
# que uno corre para VER qué saldría— terminara alterando la base real.
#
# Va por DIRECT_URL (session pooler, 5432): el transaction pooler no soporta
# las sentencias del motor de migraciones.
set -euo pipefail

cd "$(dirname "$0")/../api"

echo "▸ Estado actual en Supabase…"
# La compuerta la decide el código de salida de `migrate status`, no quien lee:
# 0 es «al día» y aquí no hay nada que hacer. Distinto de 0 es o bien que hay
# pendientes —lo único que justifica seguir— o bien cualquier otra cosa (sin
# conexión, una migración fallida a medias), y entonces no se aplica nada.
# La URL sale de `prisma.config.ts` (DIRECT_URL), que lee lo que inyecta dotenv.
if ESTADO=$(npx dotenv -e .env.supabase -- npx prisma migrate status 2>&1); then
  echo "$ESTADO"
  echo "No hay migraciones pendientes. No se tocó nada."
  exit 0
fi
echo "$ESTADO"
if ! grep -q 'have not yet been applied' <<<"$ESTADO"; then
  echo "migrate status falló sin listar pendientes. No se aplica nada." >&2
  exit 1
fi

echo ""
read -r -p "¿Aplicar las migraciones pendientes a PRODUCCIÓN? (escribí 'si') " RESPUESTA
if [ "$RESPUESTA" != "si" ]; then
  echo "Cancelado. No se tocó nada."
  exit 0
fi

npx dotenv -e .env.supabase -- npx prisma migrate deploy

# ── La seguridad por filas de las tablas NUEVAS ──────────────────────────────
# Supabase publica el esquema `public` como API REST y le concede permiso a
# `anon` sobre cada tabla que aparece. Una tabla recién migrada nace, por tanto,
# abierta a cualquiera que tenga la clave pública del proyecto.
#
# `close-data-api.sql` lo deshace y es idempotente, así que se corre
# siempre: si no había nada que cerrar, no cierra nada.
echo ""
echo "▸ Cerrando el API de datos sobre las tablas nuevas…"
cd ..
npm run --silent sql:supabase -- "$(cat scripts/close-data-api.sql)"

echo "Listo."
