#!/usr/bin/env bash
#
# Copia los datos de MariaDB (Hostinger) al Postgres de Supabase.
#
# ── Por qué mysqldump y no un SELECT + INSERT a mano ─────────────────────────
# Porque el escapado es donde se pierde la información en silencio: una
# descripción con comilla simple, un salto de línea dentro de una nota, un NULL
# que se vuelve la cadena "NULL". mysqldump ya resuelve todo eso.
#
# ── Qué NO se copia ──────────────────────────────────────────────────────────
# refresh_tokens: son sesiones abiertas. Moverlas no sirve —el hash va atado al
# JWT_SECRET— y lo único que lograrían es que alguien siguiera con una sesión
# emitida por el servidor viejo. Todos vuelven a entrar, que es lo correcto en
# un cambio de base.
#
# ── El orden importa ─────────────────────────────────────────────────────────
# Hay llaves foráneas: users antes que todo lo suyo, transactions antes que sus
# splits y sus etiquetas. Al revés, el INSERT falla por integridad referencial.
set -euo pipefail

cd "$(dirname "$0")/.."

SERVIDOR="u523998927@5.183.10.14"
PUERTO=65002
LLAVE="$HOME/.ssh/hostinger_cocoapp"
ENV_REMOTO="domains/dev-cocoapp.viteri.me/hbuilds/config/.env"

TABLAS="users categories accounts tags transactions transaction_splits transaction_tags import_batches import_rows category_rules user_preferences audit_log"

VOLCADO=$(mktemp)
trap 'rm -f "$VOLCADO" "$VOLCADO.pg"' EXIT

echo "▸ Extrayendo de Hostinger…"
ssh -i "$LLAVE" -p "$PUERTO" "$SERVIDOR" "
  set -euo pipefail
  URL=\$(grep -m1 '^DATABASE_URL=' '$ENV_REMOTO' | cut -d= -f2- | tr -d '\"'\"'\"'')
  PROTO=\${URL#mysql://}; CRED=\${PROTO%%@*}; RESTO=\${PROTO#*@}
  export MYSQL_PWD=\${CRED#*:}
  HOSTPORT=\${RESTO%%/*}; BASE=\${RESTO#*/}; BASE=\${BASE%%\\?*}
  mysqldump --host=\${HOSTPORT%%:*} --port=\${HOSTPORT#*:} --user=\"\${CRED%%:*}\" \
    --no-create-info --complete-insert --skip-extended-insert --compact \
    --no-tablespaces --skip-add-locks --skip-disable-keys \
    \"\$BASE\" $TABLAS
" > "$VOLCADO"

echo "▸ Traduciendo a sintaxis de Postgres…"
# Los backticks son de MySQL; Postgres usa comillas dobles. Y MySQL escapa la
# comilla simple con barra invertida, Postgres duplicándola.
python3 - "$VOLCADO" > "$VOLCADO.pg" <<'PY'
import re, sys
sql = open(sys.argv[1], encoding='utf8', errors='replace').read()

# Se conservan SOLO los INSERT. mysqldump intercala directivas propias de MySQL
# —SET @OLD_AUTOCOMMIT, /*!40101 ... */— que Postgres rechaza con un error de
# sintaxis. Filtrar por lista blanca es mas seguro que ir tapando cada una.
sentencias = [s for s in re.findall(r'^INSERT INTO.*?;\s*$', sql, flags=re.M | re.S)]

salida = []
for s in sentencias:
    s = re.sub(r'`([^`]+)`', r'"\1"', s)   # identificadores: backtick -> comilla doble
    s = s.replace("\\'", "''")             # MySQL escapa con barra; Postgres duplicando
    s = s.replace('\\"', '"')
    salida.append(s)
print('\n'.join(salida))
PY

FILAS=$(grep -c '^INSERT' "$VOLCADO.pg" || true)
if [ "$FILAS" = "0" ]; then
  echo "No hay filas que copiar."
  exit 0
fi
echo "   $FILAS fila(s)"

echo "▸ Cargando en Supabase…"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
# ON_ERROR_STOP corta al primer fallo: media carga es peor que ninguna, porque
# deja la base en un estado que nadie sabe describir.
npx dotenv -e api/.env.supabase -- bash -c \
  'psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -q -f '"$VOLCADO.pg"

echo "▸ Reajustando las secuencias…"
# El SQL vive en su propio archivo a propósito: incrustarlo acá obligaría a
# escapar comillas y signos de dólar hasta volverlo ilegible.
npx dotenv -e api/.env.supabase -- bash -c \
  'psql "$DIRECT_URL" -q -v ON_ERROR_STOP=1 -f scripts/reajustar-secuencias.sql'

echo "Listo."
