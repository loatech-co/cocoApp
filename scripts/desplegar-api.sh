#!/usr/bin/env bash
#
# Despliega la API a Hostinger y la apunta a Supabase.
#
# ── El orden NO es negociable ────────────────────────────────────────────────
# El cliente de Prisma se genera contra un motor concreto. El que está
# desplegado se generó para MySQL. Si se le cambia la DATABASE_URL a Postgres
# sin regenerarlo, la API no arranca: el cliente no sabe hablar ese protocolo.
# Por eso el .env se cambia DESPUÉS de subir el código y regenerar el cliente,
# nunca antes.
#
# ── Por qué se compila acá y no allá ─────────────────────────────────────────
# Misma razón que el despliegue del frontend: en local está el lockfile
# verificado y la CPU. El plan compartido tiene cuota de CPU y compilar
# TypeScript allá es pedirle que nos throttlee.
#
# Desde Prisma 7 (ADR 0020) el cliente tampoco se genera allá: no hay motor
# nativo, el cliente es TypeScript en api/src/generated/prisma y `nest build`
# lo compila dentro de api/dist. Viaja con el resto del build.
set -euo pipefail

SERVIDOR="u523998927@5.183.10.14"
PUERTO=65002
LLAVE="$HOME/.ssh/hostinger_cocoapp"
DOMINIO="dev-cocoapp.viteri.me"
REMOTO="domains/${DOMINIO}/hbuilds/current/nodejs"
CONFIG="domains/${DOMINIO}/hbuilds/config"
SSH_CMD="ssh -i ${LLAVE} -p ${PUERTO}"

cd "$(dirname "$0")/.."

echo "▸ Comprobando que las pruebas pasan…"
npm run typecheck --workspaces --if-present >/dev/null
npm run test --workspace api >/dev/null
echo "   ok"

echo "▸ Compilando la API…"
npm run build --workspace api >/dev/null
[ -f api/dist/main.js ] || { echo "El build no produjo main.js. No se sube nada." >&2; exit 1; }

echo "▸ Respaldando la versión que está viva…"
# Sin esto no hay vuelta atrás. El respaldo lleva la fecha para no pisar uno
# anterior que quizá siga siendo el bueno.
FECHA=$(date +%Y%m%d-%H%M%S)
$SSH_CMD "$SERVIDOR" "
  set -e
  R=~/respaldos-cocoapp/$FECHA
  mkdir -p \"\$R\"
  cp -r ~/$REMOTO/api/dist \"\$R/api-dist\"
  cp -r ~/$REMOTO/api/prisma \"\$R/api-prisma\"
  cp ~/$CONFIG/.env \"\$R/env\"
  echo \"   respaldo: \$R\"
"

echo "▸ Subiendo el código…"
rsync -az --delete -e "$SSH_CMD" api/dist/   "$SERVIDOR:$REMOTO/api/dist/"
rsync -az --delete -e "$SSH_CMD" api/prisma/ "$SERVIDOR:$REMOTO/api/prisma/"
rsync -az          -e "$SSH_CMD" api/prisma.config.ts "$SERVIDOR:$REMOTO/api/prisma.config.ts"
rsync -az --delete -e "$SSH_CMD" packages/   "$SERVIDOR:$REMOTO/packages/"
rsync -az          -e "$SSH_CMD" package.json     "$SERVIDOR:$REMOTO/package.json"
rsync -az          -e "$SSH_CMD" api/package.json "$SERVIDOR:$REMOTO/api/package.json"

echo "▸ Instalando dependencias nuevas…"
# Se compila en local pero node_modules vive en el servidor: una dependencia
# nueva en package.json no llega sola, y el fallo aparece recién en runtime como
# "Cannot find module". `npm install` sin argumentos respeta el lockfile que se
# acaba de subir y no toca lo que ya está.
$SSH_CMD "$SERVIDOR" "
  set -e
  export PATH=/opt/alt/alt-nodejs22/root/usr/bin:\$PATH
  cd ~/$REMOTO
  npm install --no-audit --no-fund 2>&1 | tail -1
"

echo "▸ Apuntando la base a Supabase…"
# El archivo va junto al dist (api/.env) porque main.js lo busca por ruta
# ABSOLUTA derivada de __dirname, y porque tiene prioridad sobre las variables
# que LiteSpeed inyecta desde hPanel — que siguen trayendo la URL de MariaDB de
# cuando se creo la app y no se pueden editar por SSH.
$SSH_CMD "$SERVIDOR" "
  set -e
  cd ~/$CONFIG
  cp .env .env.antes-del-corte
  cp .env.supabase .env
  cp .env.supabase ~/$REMOTO/api/.env
  chmod 600 ~/$REMOTO/api/.env
  echo '   .env colocado (el anterior quedó en .env.antes-del-corte)'
"

echo "▸ Reiniciando…"
# LiteSpeed vigila tmp/restart.txt DENTRO del app root, que es lo que declara
# PassengerRestartDir en el .htaccess. El restart.txt de la raiz del dominio
# existe pero no lo mira nadie: tocarlo no reinicia nada, y el despliegue
# parecia exitoso mientras seguia corriendo el proceso viejo.
$SSH_CMD "$SERVIDOR" "touch ~/$REMOTO/tmp/restart.txt"

echo "▸ Comprobando…"
sleep 12
# No basta con que responda: /api/v1/health devuelve 401 ANTES de tocar la base,
# asi que un 401 no dice nada sobre la conexion. Se usa el login, que sí
# consulta la tabla de usuarios: si la base no responde, devuelve 500.
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
  -X POST "https://${DOMINIO}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"comprobacion@despliegue.invalido","password":"NoExiste1!"}' || echo 000)
echo "   login de prueba → ${CODIGO}  (401 = la base respondió)"

if [ "$CODIGO" = "401" ]; then
  echo ""
  echo "Listo. La API corre contra Supabase."
else
  echo ""
  echo "⚠️  Respuesta inesperada (${CODIGO}). Para volver atrás:" >&2
  echo "   ssh -i $LLAVE -p $PUERTO $SERVIDOR 'cd ~/$CONFIG && cp .env.antes-del-corte .env && touch ~/domains/${DOMINIO}/restart.txt'" >&2
  echo "   …y restaurá api/dist y api/prisma desde ~/respaldos-cocoapp/$FECHA" >&2
  exit 1
fi
