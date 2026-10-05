#!/usr/bin/env node
//
// El piloto: mide qué tan bien lee la máquina los soportes que ya tenemos.
//
// Uso:
//   npx tsx scripts/soportes/piloto.mts "<carpeta>" [--muestra N] [--fallos] [--csv <archivo>]
//
// ── Por qué esto es una medición y no una demostración ──────────────────────
// Porque hay VERDAD DE TERRENO para los 443 soportes: el nombre del archivo y
// el CSV dicen de qué es cada uno, cuánto se pagó y cuándo. Así que no hace
// falta mirar veinte a ojo y opinar: se puede contar exactamente en cuántos
// acierta el concepto, en cuántos el valor al peso, y en cuántos se equivoca
// creyéndose seguro —que es el único error que de verdad cuesta—.
//
// El texto sale del PDF con pdf.js, que es el mismo motor que ya usa la app
// para leer extractos. Los recibos de servicios son digitales y traen su texto
// dentro; para los escaneados hará falta OCR, y el informe dice cuántos son.
import { readFileSync } from 'node:fs';

import { clasificar, necesitaRevision } from '@coco/lectura';

import { DEFAULT_CSV } from '../data-dir.mjs';
import { emparejar, leerArchivos, leerCsv } from './emparejar.mjs';

const args = process.argv.slice(2);
const raiz = args.find((a) => !a.startsWith('--'));
const bandera = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const muestra = bandera('--muestra') ? Number(bandera('--muestra')) : Infinity;
const verFallos = args.includes('--fallos');
const csv = bandera('--csv') ?? DEFAULT_CSV;

if (!raiz) {
  console.error('Uso: npx tsx scripts/soportes/piloto.mts "<carpeta>" [--muestra N] [--fallos]');
  process.exit(1);
}

// ── El texto de un PDF ───────────────────────────────────────────────────────
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

/**
 * El texto de la primera página, reconstruido en líneas.
 *
 * Las líneas importan: la mitad de las reglas del monto miran QUÉ DICE la línea
 * donde está el número. Un texto aplanado a un solo párrafo pierde justo eso.
 */
async function textoDelPdf(ruta, paginas = 2) {
  const documento = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(ruta)),
    verbosity: 0,
  }).promise;

  const trozos = [];
  for (let n = 1; n <= Math.min(paginas, documento.numPages); n += 1) {
    const pagina = await documento.getPage(n);
    const contenido = await pagina.getTextContent();

    // Se agrupa por coordenada Y: pdf.js entrega fragmentos sueltos, y dos
    // fragmentos a la misma altura son la misma línea del recibo.
    const filas = new Map();
    for (const item of contenido.items) {
      if (typeof item.str !== 'string' || item.str.trim() === '') continue;
      const y = Math.round(item.transform[5]);
      if (!filas.has(y)) filas.set(y, []);
      filas.get(y).push({ x: item.transform[4], s: item.str });
    }

    const ordenadas = [...filas.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, partes] of ordenadas) {
      trozos.push(
        partes
          .sort((a, b) => a.x - b.x)
          .map((p) => p.s)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
  }

  await documento.cleanup();
  return trozos.join('\n');
}

// ── El corpus, con su verdad ─────────────────────────────────────────────────
const filas = leerCsv(csv);
const { archivos } = leerArchivos(raiz);
const { casados } = emparejar(archivos, filas);

/*
  Un caso por ARCHIVO, pero el valor se juzga por MOVIMIENTO.

  Es un error que cometí al medir y que cambiaba el resultado entero: cuando un
  pago viene partido en dos recibos, el CSV trae el TOTAL —los 719.000 del
  colegio— y cada PDF trae su parte —470.000 y 249.000—. Comparando cada
  archivo contra el total, el motor "fallaba" en los dos aunque hubiera leído
  bien los dos. Lo que hay que comparar es la SUMA del grupo.
*/
const casos = [];
for (const grupo of casados) {
  for (const archivo of grupo.archivos) {
    casos.push({
      archivo,
      verdad: grupo.fila,
      hermanos: grupo.archivos.length,
      clave: grupo.clave,
    });
  }
}

const aProbar = casos.slice(0, muestra);
/** Lo leído en cada movimiento, para sumarlo al final. */
const leidoPorMovimiento = new Map();

console.log(`\n▸ Piloto sobre ${aProbar.length} soportes con verdad conocida\n`);

/*
  Las cuentas van SEPARADAS por si el PDF traía texto.

  Mezcladas, el informe miente en las dos direcciones: hace parecer malo un
  motor que acierta casi siempre cuando puede leer, y esconde que la mitad del
  corpus son escaneos donde todavía no hay nada que leer. Son dos problemas
  distintos —uno de reglas, otro de OCR— y solo separados se sabe cuál atacar.
*/
const vacio = () => ({
  total: 0,
  concepto: 0,
  grupo: 0,
  valor: 0,
  fecha: 0,
  aRevisar: 0,
  segurosYMal: 0,
});
const conTexto = vacio();
const sinTexto = vacio();
const fallos = [];

for (const caso of aProbar) {
  const { archivo, verdad } = caso;
  let texto = '';
  if (archivo.ext === 'pdf') {
    try {
      texto = await textoDelPdf(archivo.ruta);
    } catch {
      texto = '';
    }
  }

  // Veinte caracteres: por debajo de eso un PDF "con texto" solo trae el
  // nombre del productor y una fecha de creación, que no es el recibo.
  const hayTexto = texto.replace(/\s/g, '').length >= 20;

  const lectura = clasificar({
    texto,
    fuente: 'texto-embebido',
    // El nombre del archivo, SIN el "i de N" ni la extensión: eso no es señal.
    nombreDeArchivo: archivo.nombre.replace(/ - \d+ de \d+/, '').replace(/\.[a-z]+$/i, ''),
    periodo: archivo.periodo,
  });

  const conceptoOk = lectura.concepto === verdad.concepto;
  const grupoOk = lectura.grupo === verdad.grupo;
  const fechaOk = lectura.fecha === verdad.fecha;

  // El valor se acumula por movimiento; se juzga después de leerlos todos.
  const acumulado = leidoPorMovimiento.get(caso.clave) ?? {
    verdad: verdad.valor,
    valores: [],
    archivos: caso.hermanos,
    hayTexto: true,
  };
  if (lectura.valor !== null) acumulado.valores.push(Math.round(lectura.valor));
  if (!hayTexto) acumulado.hayTexto = false;
  leidoPorMovimiento.set(caso.clave, acumulado);

  const c = hayTexto ? conTexto : sinTexto;
  c.total += 1;
  if (conceptoOk) c.concepto += 1;
  if (grupoOk) c.grupo += 1;
  if (fechaOk) c.fecha += 1;

  const revisar = necesitaRevision(lectura);
  if (revisar) c.aRevisar += 1;
  // El error que de verdad cuesta: seguro de sí mismo y equivocado en el
  // ACREEDOR, que es lo que se juzga por archivo.
  if (!revisar && !conceptoOk) c.segurosYMal += 1;

  if (!conceptoOk || !fechaOk) {
    fallos.push({ archivo, verdad, lectura, conceptoOk, valorOk: true, fechaOk, hayTexto });
  }
}

// ── El valor, por movimiento ─────────────────────────────────────────────────
const porMovimiento = { total: 0, exactos: 0, conTexto: 0, exactosConTexto: 0 };
const valoresMal = [];

/*
  ── Cómo se combinan varios soportes de un mismo pago ──────────────────────
  Dos casos reales y opuestos:

  · El colegio manda la factura en dos hojas con importes distintos —470.000 y
    249.000— y el pago fue la SUMA: 719.000.
  · La planilla de la PILA viene dos veces, la misma hoja con el mismo total
    —377.300 y 377.300— y el pago fue UNO.

  La regla que los separa es sencilla y no necesita saber de qué acreedor es:
  si todos los soportes dicen lo MISMO, es un total visto varias veces; si
  dicen cosas distintas, son partes que suman. Sin esto, cada planilla
  duplicada contaba doble.
*/
function combinar(valores) {
  if (valores.length === 0) return null;
  const distintos = new Set(valores);
  if (distintos.size === 1) return valores[0];
  return valores.reduce((a, b) => a + b, 0);
}

for (const [clave, m] of leidoPorMovimiento) {
  porMovimiento.total += 1;
  m.suma = combinar(m.valores);
  m.leidos = m.valores.length;
  const exacto = m.suma === m.verdad;
  if (exacto) porMovimiento.exactos += 1;
  if (m.hayTexto) {
    porMovimiento.conTexto += 1;
    if (exacto) porMovimiento.exactosConTexto += 1;
    else valoresMal.push({ clave, ...m });
  }
}

function informe(titulo, c) {
  if (c.total === 0) return;
  const pc = (n) => `${((n / c.total) * 100).toFixed(1)}%`.padStart(7);
  const fila = (etiqueta, n) =>
    console.log(
      `    ${etiqueta.padEnd(24)}${String(n).padStart(4)} / ${String(c.total).padEnd(4)} ${pc(n)}`,
    );

  console.log(`\n  ${titulo}  (${c.total} soportes)`);
  console.log('  ' + '─'.repeat(52));
  fila('Concepto acertado', c.concepto);
  fila('Grupo acertado', c.grupo);
  fila('Fecha exacta', c.fecha);
  fila('Marcados para revisar', c.aRevisar);
  fila('SEGUROS Y EQUIVOCADOS', c.segurosYMal);
}

informe('CON texto embebido — lo que el motor sí puede leer', conTexto);
informe('SIN texto embebido — escaneos, hoy ilegibles sin OCR', sinTexto);

console.log(`\n  VALOR, sumado por movimiento  (${porMovimiento.total} movimientos)`);
console.log('  ' + '─'.repeat(52));
console.log(
  `    ${'Exacto al peso'.padEnd(24)}${String(porMovimiento.exactos).padStart(4)} / ${String(porMovimiento.total).padEnd(4)} ${`${((porMovimiento.exactos / porMovimiento.total) * 100).toFixed(1)}%`.padStart(7)}`,
);
console.log(
  `    ${'…de los legibles'.padEnd(24)}${String(porMovimiento.exactosConTexto).padStart(4)} / ${String(porMovimiento.conTexto).padEnd(4)} ${`${((porMovimiento.exactosConTexto / porMovimiento.conTexto) * 100).toFixed(1)}%`.padStart(7)}`,
);

const totalSeguroYMal = conTexto.segurosYMal + sinTexto.segurosYMal;
console.log(
  `\n  De ${aProbar.length} soportes, ${totalSeguroYMal} con el ACREEDOR mal creyéndose seguros.`,
);

if (verFallos && valoresMal.length > 0) {
  console.log(`\n  ── ${valoresMal.length} movimientos legibles con el valor mal ──────\n`);
  for (const v of valoresMal.slice(0, 25)) {
    const [periodo, concepto] = v.clave.split('|');
    console.log(
      `    ${periodo} ${concepto.padEnd(26)} leyó ${String(v.suma).padStart(9)} · era ${String(v.verdad).padStart(9)}  (${v.leidos}/${v.archivos} archivos)`,
    );
  }
}

if (verFallos && fallos.length > 0) {
  console.log(`\n  ── ${fallos.length} casos con algo mal ────────────────────────────\n`);
  for (const f of fallos.slice(0, 40)) {
    console.log(`  ${f.archivo.nombre}`);
    if (!f.conceptoOk) {
      console.log(`     concepto: dijo ${f.lectura.concepto ?? '—'} · era ${f.verdad.concepto}`);
    }
    if (!f.valorOk) {
      console.log(`     valor:    dijo ${f.lectura.valor ?? '—'} · era ${f.verdad.valor}`);
    }
    if (!f.fechaOk) {
      console.log(`     fecha:    dijo ${f.lectura.fecha ?? '—'} · era ${f.verdad.fecha}`);
    }
    console.log(
      `     confianza ${f.lectura.confianza}${f.hayTexto ? '' : ' · SIN TEXTO'} — ${f.lectura.motivo}`,
    );
    console.log();
  }
  if (fallos.length > 40) console.log(`  … y ${fallos.length - 40} más\n`);
}
