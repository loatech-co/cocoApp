#!/usr/bin/env bash
#
# Aplica las migraciones pendientes a Supabase (producción).
#
# ── Por qué es un script aparte y no el final de nueva-migracion.sh ──────────
# Porque tocar producción tiene que ser un acto deliberado. Encadenarlo a la
# creación de la migración haría que un `migrate diff` exploratorio —de esos
# que uno corre para VER qué saldría— terminara alterando la base real.
#
# Va por DIRECT_URL (session pooler, 5432): el transaction pooler no soporta
# las sentencias del motor de migraciones.
set -euo pipefail

cd "$(dirname "$0")/../api"

echo "▸ Estado actual en Supabase…"
npx dotenv -e .env.supabase -- npx prisma migrate status || true

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
# `cerrar-el-api-de-datos.sql` lo deshace y es idempotente, así que se corre
# siempre: si no había nada que cerrar, no cierra nada.
echo ""
echo "▸ Cerrando el API de datos sobre las tablas nuevas…"
cd ..
npm run --silent sql:supabase -- "$(cat scripts/cerrar-el-api-de-datos.sql)"

echo "Listo."
