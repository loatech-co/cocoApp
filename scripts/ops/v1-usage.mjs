#!/usr/bin/env node
//
// Cuenta los usos de la API v1 en los logs del servidor, por día y por ruta.
//
// ── Para qué ─────────────────────────────────────────────────────────────────
// Es la evidencia para contraer la v1 (paso 7.10): siete días seguidos sin una
// sola línea `v1_used`. Cada petición a /api/v1 deja una (la escribe
// `common/versioning/v1-deprecation.ts`) con la PLANTILLA de la ruta —nunca ids
// ni datos—. Los sondeos van a /api/v2/health y /api/v2/ready, así que no
// cuentan como clientes.
//
// ── Cómo toca el servidor ────────────────────────────────────────────────────
// UNA sola conexión ssh, de solo lectura, con BatchMode (nunca pide clave) y un
// tope de tiempo. El plan compartido tiene un tope de procesos muy bajo, así
// que allá corre un único `awk` (vía `exec`, sin dejar el shell vivo) que
// filtra los archivos y devuelve solo lo necesario: la primera línea de cada
// archivo —para saber desde cuándo hay log— y las líneas `v1_used`. El conteo
// se hace aquí.
//
// Uso:
//   node scripts/ops/v1-usage.mjs                    # contra el servidor
//   node scripts/ops/v1-usage.mjs --file api.log ... # contra archivos locales
//   node scripts/ops/v1-usage.mjs --json             # salida para máquinas
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SERVER = 'u523998927@5.183.10.14';
const PORT = '65002';
const KEY = join(homedir(), '.ssh', 'hostinger_cocoapp');
const LOG_DIR = 'domains/dev-cocoapp.viteri.me/logs/coco-api';
const TIMEOUT_MS = 60_000;
const QUIET_DAYS_REQUIRED = 7;
const MARKER = '"msg":"v1_used"';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const fileIndex = args.indexOf('--file');
const localFiles =
  fileIndex === -1 ? [] : args.slice(fileIndex + 1).filter((a) => !a.startsWith('--'));

/** Lines from local files, filtered the same way the server filters them. */
function readLocal(files) {
  const out = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (index === 0 || line.includes(MARKER)) out.push(line);
    });
  }
  return out;
}

/** One read-only ssh call; the server runs a single awk process. */
function readRemote() {
  const remote = `cd ${LOG_DIR} && exec awk 'FNR==1 || index($0, "${MARKER.replaceAll('"', '\\"')}")' api.log*`;
  const result = spawnSync(
    'ssh',
    ['-i', KEY, '-p', PORT, '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SERVER, remote],
    { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) {
    console.error(`No se pudo leer el log del servidor: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`ssh terminó con ${result.status}: ${result.stderr.trim()}`);
    process.exit(1);
  }
  return result.stdout.split('\n');
}

function parse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

const lines = localFiles.length > 0 ? readLocal(localFiles) : readRemote();

let oldest = null;
const byDay = new Map();
const byRoute = new Map();
let total = 0;
let last = null;

for (const line of lines) {
  const entry = parse(line);
  if (!entry || typeof entry.time !== 'string') continue;
  if (!oldest || entry.time < oldest) oldest = entry.time;
  if (entry.msg !== 'v1_used') continue;

  total += 1;
  if (!last || entry.time > last) last = entry.time;
  const day = entry.time.slice(0, 10);
  const route = `${entry.method ?? '?'} ${entry.route ?? '?'}`;
  byDay.set(day, (byDay.get(day) ?? 0) + 1);
  const perRoute = byRoute.get(route) ?? new Map();
  perRoute.set(day, (perRoute.get(day) ?? 0) + 1);
  byRoute.set(route, perRoute);
}

const DAY_MS = 86_400_000;
const now = Date.now();
const coveredDays = oldest ? Math.floor((now - Date.parse(oldest)) / DAY_MS) : 0;
const quietDays = last ? Math.floor((now - Date.parse(last)) / DAY_MS) : coveredDays;
const enoughLog = coveredDays >= QUIET_DAYS_REQUIRED;
const ready = enoughLog && quietDays >= QUIET_DAYS_REQUIRED;

const report = {
  logSince: oldest,
  coveredDays,
  total,
  lastUse: last,
  quietDays,
  readyToContract: ready,
  byDay: Object.fromEntries([...byDay].sort()),
  byRoute: Object.fromEntries(
    [...byRoute].sort().map(([route, days]) => [route, Object.fromEntries([...days].sort())]),
  ),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Log desde: ${oldest ?? 'sin líneas'} (${coveredDays} días)`);
  console.log(`Usos de la v1: ${total}${last ? `, el último ${last}` : ''}`);
  if (byDay.size > 0) {
    console.log('\nPor día:');
    for (const [day, count] of Object.entries(report.byDay)) {
      console.log(`  ${day}  ${count}`);
    }
    console.log('\nPor ruta:');
    for (const [route, days] of Object.entries(report.byRoute)) {
      const sum = Object.values(days).reduce((a, b) => a + b, 0);
      console.log(`  ${String(sum).padStart(6)}  ${route}`);
    }
  }
  console.log('');
  if (!enoughLog) {
    console.log(
      `El log solo cubre ${coveredDays} días: no alcanza para probar ${QUIET_DAYS_REQUIRED} sin usos.`,
    );
  } else if (ready) {
    console.log(`${quietDays} días sin usos de la v1: se puede contraer.`);
  } else {
    console.log(
      `${quietDays} días sin usos de la v1: faltan para llegar a ${QUIET_DAYS_REQUIRED}.`,
    );
  }
}
