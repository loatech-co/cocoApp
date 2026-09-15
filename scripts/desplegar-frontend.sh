#!/usr/bin/env bash
#
# Compila la SPA y la sube a Hostinger.
#
# ── Por qué no se usa el despliegue de git de Hostinger ─────────────────────
# Porque hace `git clone` y nada más: clona el CÓDIGO FUENTE dentro de
# public_html —donde Apache lo sirve a cualquiera— y no ejecuta ningún build.
# Su paso de dependencias es de Composer, no de npm. Para un monorepo de
# TypeScript que hay que compilar, ese mecanismo no sirve.
#
# Aquí se compila en local, donde ya está el lockfile verificado, y se sube
# SOLO el resultado.
set -euo pipefail

SERVIDOR="u523998927@5.183.10.14"
PUERTO=65002
LLAVE="$HOME/.ssh/hostinger_cocoapp"
DOMINIO="${1:-dev-cocoapp.viteri.me}"
# ── Por qué NO va a public_html ──────────────────────────────────────────────
# Porque ahí no lo sirve nadie. La SPA la entrega el propio proceso de la API
# (SpaModule), que la lee desde su carpeta frontend/dist. public_html quedó
# vacío cuando se unificaron API y SPA en un solo dominio, y subir ahí producía
# un despliegue que parecía exitoso y no cambiaba nada de lo que se ve.
DESTINO="domains/${DOMINIO}/hbuilds/current/nodejs/frontend/dist"

cd "$(dirname "$0")/.."

echo "▸ Compilando la SPA…"
npm run prepare:ocr --silent
npm run build --workspace @coco/frontend

if [ ! -f frontend/dist/index.html ]; then
  echo "El build no produjo index.html. No se sube nada." >&2
  exit 1
fi

echo ""
echo "▸ Subiendo a ${DOMINIO}…"

# --delete limpia los assets de despliegues anteriores: sus nombres llevan
# hash, así que se acumularían para siempre. Aquí es seguro porque el destino
# contiene EXCLUSIVAMENTE el build de la SPA, nada compartido con la API.
rsync -az --delete \
  -e "ssh -i ${LLAVE} -p ${PUERTO}" \
  frontend/dist/ "${SERVIDOR}:${DESTINO}/"

# El proceso cachea rutas de archivos estáticos al arrancar, así que un build
# nuevo no se ve hasta reiniciarlo.
ssh -i "$LLAVE" -p "$PUERTO" "$SERVIDOR" \
  "touch domains/${DOMINIO}/hbuilds/current/nodejs/tmp/restart.txt"
sleep 12

echo ""
echo "▸ Comprobando…"
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMINIO}/" --max-time 20)
echo "   https://${DOMINIO}/ → ${CODIGO}"

CODIGO_RUTA=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMINIO}/movimientos" --max-time 20)
echo "   /movimientos → ${CODIGO_RUTA}  (debe ser 200: lo resuelve la SPA)"

echo ""
echo "Listo."
