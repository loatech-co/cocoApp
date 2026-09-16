#!/usr/bin/env bash
#
# Lleva el almacén de soportes al servidor.
#
# ── Por qué es un paso aparte del despliegue ────────────────────────────────
# Porque el código cambia todas las semanas y los recibos casi nunca. Metido
# dentro del despliegue, cada corrección de un color arrastraría treinta megas
# por la red; y al revés, cargar un recibo nuevo no tiene por qué obligar a
# reiniciar la API.
#
# ── Por qué NO lleva --delete ───────────────────────────────────────────────
# A propósito, y es la diferencia más importante con los otros scripts de este
# repositorio. Los `rsync --delete` del despliegue borran lo que sobra porque
# el código es reemplazable: está en git. Un recibo escaneado no lo está. Si
# algún día el almacén local está vacío o a medias —una máquina nueva, una
# carpeta que no se copió— un `--delete` se llevaría por delante los soportes
# del servidor y no habría de dónde sacarlos.
#
# Se AÑADE, nunca se quita. Borrar un soporte del servidor es un acto
# deliberado, a mano, mirando lo que se borra.
#
# ── Por qué basta con la comparación por defecto ────────────────────────────
# Porque estos archivos son INMUTABLES: su nombre es un uuid y su contenido no
# se edita nunca. Un archivo que ya está allá es idéntico al de acá, y `-a`
# conserva la fecha, así que la segunda corrida no manda nada. No hace falta
# `--checksum`, que además el rsync de macOS —openrsync— no trae.
#
# Los permisos se arreglan al final con un `chmod` remoto, por lo mismo:
# `--chmod` tampoco existe en openrsync.
set -euo pipefail

SERVIDOR="u523998927@5.183.10.14"
PUERTO=65002
LLAVE="$HOME/.ssh/hostinger_cocoapp"
REMOTO="soportes-cocoapp"
SSH_CMD="ssh -i ${LLAVE} -p ${PUERTO}"

cd "$(dirname "$0")/../.."
LOCAL="${1:-api/.soportes}"

[ -d "$LOCAL" ] || { echo "No existe $LOCAL. ¿Corriste el importador?" >&2; exit 1; }

CUANTOS=$(find "$LOCAL" -type f | wc -l | tr -d ' ')
PESO=$(du -sh "$LOCAL" | cut -f1)
echo "▸ ${CUANTOS} archivos (${PESO}) → ${SERVIDOR}:~/${REMOTO}/"

# El destino con permisos 700 antes de escribir nada: crearlo con la umask por
# defecto lo dejaría legible por el grupo, y en un plan compartido el grupo no
# es solo uno.
$SSH_CMD "$SERVIDOR" "mkdir -p ~/${REMOTO} && chmod 700 ~/${REMOTO}"

rsync -az --stats -e "$SSH_CMD" "$LOCAL/" "$SERVIDOR:~/${REMOTO}/" | tail -4

echo "▸ Cerrando permisos…"
# 700 en las carpetas y 600 en los archivos: en un plan compartido, el grupo no
# es solo uno. Va después del rsync porque openrsync no sabe hacerlo al vuelo.
$SSH_CMD "$SERVIDOR" "
  find ~/${REMOTO} -type d -exec chmod 700 {} + 
  find ~/${REMOTO} -type f -exec chmod 600 {} +
"

echo "▸ Comprobando lo que llegó…"
REMOTOS=$($SSH_CMD "$SERVIDOR" "find ~/${REMOTO} -type f | wc -l" | tr -d ' ')
echo "   local ${CUANTOS} · servidor ${REMOTOS}"

if [ "$REMOTOS" -lt "$CUANTOS" ]; then
  echo "⚠️  Al servidor le faltan archivos. Vuelve a correr esto." >&2
  exit 1
fi

echo ""
echo "Listo. El almacén del servidor está en ~/${REMOTO} (700, fuera de public_html)."
