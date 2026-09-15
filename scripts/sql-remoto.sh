#!/usr/bin/env bash
#
# Ejecuta SQL contra la MariaDB VIEJA de Hostinger.
#
# Sigue existiendo despues de la migracion a Supabase: es la via de retorno
# mientras no se confirme que Postgres va bien. Para la base en uso hoy:
# npm run sql:supabase
#
# ── Por qué no se conecta directamente desde acá ─────────────────────────────
# El MariaDB del hosting compartido solo escucha en localhost. Abrirlo a
# internet exige meter la IP en "Remote MySQL" de hPanel, y esa IP cambia:
# habría que mantener una lista blanca, y mientras tanto la base de datos
# financieros queda expuesta al puerto 3306 público. Este script hace lo
# contrario: entra por SSH y ejecuta mysql DENTRO del servidor, que es donde
# la base ya es local.
#
# ── Por qué las credenciales no salen del servidor ───────────────────────────
# La DATABASE_URL se lee y se parsea EN el servidor, y la contraseña se pasa a
# mysql por MYSQL_PWD en vez de por --password, porque los argumentos de la
# línea de comandos son visibles en `ps` para cualquier otro proceso de la
# máquina compartida. Ni la URL ni la contraseña se imprimen nunca ni viajan
# de vuelta.
set -euo pipefail

SERVIDOR="u523998927@5.183.10.14"
PUERTO=65002
LLAVE="$HOME/.ssh/hostinger_cocoapp"
# Tras el corte a Supabase, el .env activo apunta a Postgres. La MariaDB vieja
# sigue viva y su configuracion quedo en el respaldo del corte: es ahi donde
# este script la busca.
ENV_REMOTO="${ENV_MARIADB:-domains/dev-cocoapp.viteri.me/hbuilds/config/.env.mariadb.bak}"

SQL="${1:-}"
if [ -z "$SQL" ]; then
  echo 'Uso: scripts/sql-remoto.sh "SELECT ..."' >&2
  exit 1
fi

# El SQL viaja por stdin, no como argumento: así no hay que escapar comillas ni
# aparece en el `ps` del servidor.
printf '%s\n' "$SQL" | ssh -i "$LLAVE" -p "$PUERTO" "$SERVIDOR" "
  set -euo pipefail
  URL=\$(grep -m1 '^DATABASE_URL=' '$ENV_REMOTO' | cut -d= -f2- | tr -d '\"'\"'\"'')
  # Tras el corte a Supabase este archivo ya no describe una MariaDB. Sin esta
  # comprobacion, el parseo tomaba 'postgresql' como usuario y lanzaba el
  # cliente mysql contra el pooler de Supabase, donde se quedaba colgado.
  case \"\$URL\" in
    mysql://*) ;;
    *) echo 'Este script es solo para la MariaDB de Hostinger; el .env ya no apunta ahi.' >&2; exit 1 ;;
  esac
  # mysql://usuario:contraseña@host:puerto/base
  PROTO=\${URL#mysql://}
  CRED=\${PROTO%%@*}
  RESTO=\${PROTO#*@}
  USUARIO=\${CRED%%:*}
  export MYSQL_PWD=\${CRED#*:}
  HOSTPORT=\${RESTO%%/*}
  BASE=\${RESTO#*/}
  BASE=\${BASE%%\\?*}
  mysql --host=\${HOSTPORT%%:*} --port=\${HOSTPORT#*:} --user=\"\$USUARIO\" \
        --database=\"\$BASE\" --table
"
