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
DESTINO="domains/${DOMINIO}/public_html"

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
# hash, así que se acumularían para siempre.
#
# Las exclusiones NO son opcionales:
#   · dev-env  → es donde el despliegue de git de Hostinger clona el repo. Sin
#                excluirlo, --delete lo borraría y ese despliegue se rompería.
#   · .well-known → certificados de Let's Encrypt. Borrarlos tumba el HTTPS.
rsync -az --delete \
  --exclude 'dev-env/' \
  --exclude '.well-known/' \
  -e "ssh -i ${LLAVE} -p ${PUERTO}" \
  frontend/dist/ "${SERVIDOR}:${DESTINO}/"

# La página por defecto de Hostinger gana a index.html en el orden de Apache.
# Mientras exista, el sitio muestra "¡Ya todo está listo!" en vez de la app.
ssh -i "$LLAVE" -p "$PUERTO" "$SERVIDOR" "rm -f ${DESTINO}/default.php"

echo ""
echo "▸ Comprobando…"
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMINIO}/" --max-time 20)
echo "   https://${DOMINIO}/ → ${CODIGO}"

CODIGO_RUTA=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMINIO}/movimientos" --max-time 20)
echo "   /movimientos → ${CODIGO_RUTA}  (debe ser 200: lo resuelve la SPA)"

echo ""
echo "Listo."
