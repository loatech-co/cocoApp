#!/usr/bin/env bash
#
# Ejecuta SQL contra el Postgres de Supabase.
#
# ── Por qué por la Management API y no por conexión directa ──────────────────
# Porque no necesita la contraseña de la base. Es el mismo endpoint que usa el
# editor SQL del dashboard: se autentica con el Personal Access Token, que ya
# está en .env.migrate. La contraseña de Postgres sigue haciendo falta para lo
# que conecta por cable —Prisma y la API— pero no para inspeccionar ni corregir
# desde acá.
#
# El token NO se pasa por la línea de comandos: lo inyecta `dotenv` en el
# entorno y lo expande el propio proceso, porque los argumentos son visibles
# en `ps` para cualquier otro proceso de la máquina.
set -euo pipefail

PROYECTO="${SUPABASE_PROJECT_REF:-yocafgrrbtmldygjxkva}"

SQL="${1:-}"
if [ -z "$SQL" ]; then
  echo 'Uso: npm run sql:supabase -- "SELECT ..."' >&2
  exit 1
fi

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Falta SUPABASE_ACCESS_TOKEN. Corré esto con: npm run sql:supabase -- \"...\"" >&2
  exit 1
fi

# jq arma el JSON: el SQL puede traer comillas, saltos de línea y barras, y
# construir el cuerpo a mano los rompería.
CUERPO=$(jq -n --arg q "$SQL" '{query: $q}')

RESPUESTA=$(curl -s -X POST \
  "https://api.supabase.com/v1/projects/${PROYECTO}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$CUERPO" --max-time 60)

# Un error de la API llega como objeto con "message"; un resultado, como lista.
if echo "$RESPUESTA" | jq -e 'type == "object" and has("message")' >/dev/null 2>&1; then
  echo "Error: $(echo "$RESPUESTA" | jq -r '.message')" >&2
  exit 1
fi

if [ "$(echo "$RESPUESTA" | jq 'length')" = "0" ]; then
  echo "(sin filas)"
else
  echo "$RESPUESTA" | jq -r '(.[0] | keys_unsorted) as $k
    | ($k | @tsv), (.[] | [$k[] as $c | .[$c] | tostring] | @tsv)' \
    | column -t -s $'\t'
  echo "$(echo "$RESPUESTA" | jq 'length') fila(s)"
fi
