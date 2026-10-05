#!/usr/bin/env node
//
// El reporte del emparejamiento. No toca la base ni los archivos: solo mira.
//
// Uso:
//   node scripts/soportes/reporte.mjs "<carpeta de soportes>" [--csv <archivo>] [--todo]
//
// Sin `--todo` resume; con `--todo` lista una por una las filas de cada montón,
// que es lo que hace falta para revisar a mano lo ambiguo.
import { emparejar, leerArchivos, leerCsv } from './emparejar.mjs';

const args = process.argv.slice(2);
const raiz = args.find((a) => !a.startsWith('--'));
const todo = args.includes('--todo');
// `indexOf` devuelve -1 cuando la bandera no está, y `args[-1 + 1]` es el
// primer argumento —la carpeta—: sin este guardia, omitir `--csv` hacía que el
// script intentara leer el directorio como si fuera el CSV.
const iCsv = args.indexOf('--csv');
const csv = iCsv >= 0 ? args[iCsv + 1] : 'datos/Gastos_Consolidado.csv';

if (!raiz) {
  console.error('Uso: node scripts/soportes/reporte.mjs "<carpeta>" [--csv <archivo>] [--todo]');
  process.exit(1);
}

const filas = leerCsv(csv);
const { archivos, ilegibles } = leerArchivos(raiz);
const { casados, ambiguos, huerfanos, sinSoporte } = emparejar(archivos, filas);

const conSoporte = casados.reduce((n, c) => n + c.archivos.length, 0);

console.log(`\n  CSV        ${filas.length} movimientos`);
console.log(
  `  Carpeta    ${archivos.length} archivos${ilegibles.length ? ` (+${ilegibles.length} ilegibles)` : ''}`,
);
console.log('  ─────────────────────────────────────────────────────────');
console.log(
  `  Casados    ${String(casados.length).padStart(4)} movimientos · ${conSoporte} archivos`,
);
console.log(
  `  Ambiguos   ${String(ambiguos.length).padStart(4)} grupos · ${ambiguos.reduce((n, a) => n + a.archivos.length, 0)} archivos`,
);
console.log(
  `  Sin match  ${String(huerfanos.length).padStart(4)} grupos · ${huerfanos.reduce((n, h) => n + h.archivos.length, 0)} archivos`,
);
console.log(`  Sin soporte ${String(sinSoporte.length).padStart(3)} movimientos del CSV\n`);

const varios = casados.filter((c) => c.archivos.length > 1);
if (varios.length > 0) {
  console.log(`  ${varios.length} movimientos traen más de un soporte:`);
  for (const c of varios.slice(0, todo ? varios.length : 5)) {
    console.log(`    ${c.fila.concepto} · ${c.fila.fecha} → ${c.archivos.length}`);
  }
  if (!todo && varios.length > 5) console.log(`    … y ${varios.length - 5} más (--todo)`);
  console.log();
}

if (ambiguos.length > 0) {
  console.log('  ── AMBIGUOS ─ se dejan sin tocar, para mirar a mano ──────');
  for (const a of ambiguos) {
    console.log(
      `\n    ${a.archivos.length} archivo(s): ${a.archivos.map((x) => x.nombre).join(', ')}`,
    );
    for (const c of a.candidatas) {
      console.log(
        `      candidata: ${c.periodo} · ${c.fecha} · ${c.concepto} · $${c.valor.toLocaleString('es-CO')} · ${c.grupo}`,
      );
    }
  }
  console.log();
}

if (huerfanos.length > 0) {
  console.log('  ── SIN MATCH ─ archivos sin movimiento en el CSV ─────────');
  for (const h of huerfanos.slice(0, todo ? huerfanos.length : 20)) {
    const [periodo, concepto, fecha] = h.clave.split('|');
    console.log(
      `    ${periodo} · ${concepto} · ${fecha} → ${h.archivos.map((x) => x.nombre).join(', ')}`,
    );
  }
  if (!todo && huerfanos.length > 20) console.log(`    … y ${huerfanos.length - 20} más (--todo)`);
  console.log();
}

if (ilegibles.length > 0) {
  console.log('  ── ILEGIBLES ─ el nombre no dice qué son ─────────────────');
  for (const i of ilegibles) console.log(`    ${i.ruta} — ${i.motivo}`);
  console.log();
}

if (todo && sinSoporte.length > 0) {
  console.log('  ── MOVIMIENTOS SIN NINGÚN SOPORTE ────────────────────────');
  for (const f of sinSoporte) {
    console.log(
      `    ${f.periodo} · ${f.fecha} · ${f.concepto} · $${f.valor.toLocaleString('es-CO')}`,
    );
  }
  console.log();
}
