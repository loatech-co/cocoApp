//
// Empareja los soportes escaneados con los movimientos ya cargados.
//
// ── De dónde sale la certeza ────────────────────────────────────────────────
// No de parecerse. Cada movimiento que entró por `cargar-historico.mjs` lleva
// en `external_ref` una huella estable:
//
//     sha256(Fecha_Pago | Valor | Centro | Grupo | Concepto | Periodo)
//
// Así que el CSV no es "una referencia" sino la clave primaria del asunto: si
// del nombre del archivo se sacan Concepto, Fecha_Pago y Periodo, y con eso se
// encuentra UNA sola fila del CSV, su huella apunta al movimiento exacto. No
// hay que adivinar, y donde no se puede decidir, no se decide.
//
// ── Qué dice cada parte del nombre ──────────────────────────────────────────
//
//     2022/02-Febrero/Colegio Rafael Pombo - 2022-01-29.pdf
//     └──┬───────────┘ └──────┬──────────┘   └────┬─────┘
//        │                    │                   └── Fecha_Pago
//        │                    └── Concepto
//        └── Anio y Mes: el PERIODO, que no es el mes del pago
//
// Esa diferencia —la matrícula de febrero pagada el 29 de enero— es justo lo
// que separa dos movimientos que de otro modo se confundirían, así que la
// carpeta no es decoración: es parte de la clave.
//
// ── Los soportes múltiples ──────────────────────────────────────────────────
// "Claro Movil - 2024-10-03 - 1 de 3.pdf" y sus hermanos son UN movimiento con
// tres soportes. Se agrupan por (periodo, concepto, fecha) antes de buscar, no
// después: buscar tres veces lo mismo y confiar en que dé lo mismo es una
// forma lenta de equivocarse.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const EXTENSIONES = new Set(['pdf', 'jpg', 'jpeg', 'png']);

export const TIPOS = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Dos nombres son el mismo concepto si solo se diferencian en cosas que el
 * sistema de archivos no deja escribir.
 *
 * "PILA / Seguridad Social" en el CSV es "PILA - Seguridad Social" en el
 * disco, porque una barra no cabe en un nombre de archivo. También se quitan
 * las tildes: los escáneres y los teclados no siempre coinciden en eso.
 */
export function normalizar(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[/\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Divide una línea de CSV respetando las comillas. */
function partir(linea) {
  const campos = [];
  let actual = '';
  let entreComillas = false;

  for (const caracter of linea) {
    if (caracter === '"') entreComillas = !entreComillas;
    else if (caracter === ',' && !entreComillas) {
      campos.push(actual);
      actual = '';
    } else actual += caracter;
  }

  campos.push(actual);
  return campos.map((c) => c.trim());
}

/** El CSV, fila a fila, con la huella de cada movimiento ya calculada. */
export function leerCsv(ruta) {
  const lineas = readFileSync(ruta, 'utf8').split('\n').filter((l) => l.trim());
  const cabecera = partir(lineas[0]);
  const col = (nombre) => cabecera.indexOf(nombre);

  const i = {
    anio: col('Anio'),
    mes: col('Mes'),
    fecha: col('Fecha_Pago'),
    centro: col('Centro_de_costos'),
    grupo: col('Grupo'),
    concepto: col('Concepto'),
    valor: col('Valor_COP'),
  };

  if (Object.values(i).some((n) => n < 0)) {
    throw new Error('Al CSV le faltan columnas. Se esperan: Anio, Mes, Fecha_Pago, Centro_de_costos, Grupo, Concepto, Valor_COP.');
  }

  return lineas.slice(1).map(partir).map((f) => {
    const mes = MESES[f[i.mes]?.toLowerCase()];
    const periodo = mes ? `${f[i.anio]}-${String(mes).padStart(2, '0')}` : null;
    const valor = Number.parseInt(f[i.valor], 10);

    return {
      periodo,
      fecha: f[i.fecha],
      centro: f[i.centro],
      grupo: f[i.grupo],
      concepto: f[i.concepto],
      valor,
      // La MISMA huella que escribió `cargar-historico.mjs`. Si alguna vez
      // cambia allá, este emparejamiento deja de encontrar nada —que es mejor
      // que encontrar lo que no es—.
      huella: createHash('sha256')
        .update([f[i.fecha], valor, f[i.centro], f[i.grupo], f[i.concepto], periodo ?? ''].join('|'))
        .digest('hex')
        .slice(0, 40),
    };
  });
}

const NOMBRE = /^(?<concepto>.+) - (?<fecha>\d{4}-\d{2}-\d{2})(?: - (?<i>\d+) de (?<n>\d+))?\.(?<ext>[A-Za-z]+)$/;

/**
 * Los archivos del árbol de soportes, ya leídos.
 *
 * Devuelve también los que no se entienden en vez de saltárselos en silencio:
 * un archivo con el nombre mal puesto es exactamente el que hay que mirar a
 * mano, y callarlo lo convierte en un soporte que nadie sabe que falta.
 */
export function leerArchivos(raiz) {
  const archivos = [];
  const ilegibles = [];

  for (const anio of readdirSync(raiz).sort()) {
    const rutaAnio = join(raiz, anio);
    if (!statSync(rutaAnio).isDirectory() || !/^\d{4}$/.test(anio)) continue;

    for (const carpetaMes of readdirSync(rutaAnio).sort()) {
      const rutaMes = join(rutaAnio, carpetaMes);
      if (!statSync(rutaMes).isDirectory()) continue;

      const mes = carpetaMes.match(/^(\d{2})-/)?.[1];
      if (!mes) {
        ilegibles.push({ ruta: join(anio, carpetaMes), motivo: 'la carpeta del mes no empieza por "MM-"' });
        continue;
      }

      for (const nombre of readdirSync(rutaMes).sort()) {
        const ruta = join(rutaMes, nombre);
        if (!statSync(ruta).isFile() || nombre.startsWith('.')) continue;

        const m = nombre.match(NOMBRE);
        const ext = m?.groups.ext.toLowerCase();

        if (!m || !EXTENSIONES.has(ext)) {
          ilegibles.push({ ruta: join(anio, carpetaMes, nombre), motivo: 'el nombre no dice concepto y fecha' });
          continue;
        }

        archivos.push({
          ruta,
          relativa: join(anio, carpetaMes, nombre),
          nombre,
          periodo: `${anio}-${mes}`,
          concepto: m.groups.concepto,
          fecha: m.groups.fecha,
          orden: m.groups.i ? Number(m.groups.i) : 1,
          de: m.groups.n ? Number(m.groups.n) : 1,
          ext,
          mime: TIPOS[ext],
          tamano: statSync(ruta).size,
        });
      }
    }
  }

  return { archivos, ilegibles };
}

/**
 * El emparejamiento.
 *
 * Tres montones, y ninguno se mezcla con otro: lo que casa con UNA fila, lo
 * que casa con varias —que se mira a mano— y lo que no casa con ninguna.
 */
export function emparejar(archivos, filas) {
  // Índice por (periodo, concepto normalizado, fecha). Es la clave que se
  // puede leer del nombre de un archivo; el valor y la ruta del CSV no.
  const indice = new Map();
  for (const fila of filas) {
    const clave = `${fila.periodo}|${normalizar(fila.concepto)}|${fila.fecha}`;
    if (!indice.has(clave)) indice.set(clave, []);
    indice.get(clave).push(fila);
  }

  // Los soportes de un mismo movimiento, juntos antes de buscar.
  const grupos = new Map();
  for (const a of archivos) {
    const clave = `${a.periodo}|${normalizar(a.concepto)}|${a.fecha}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(a);
  }

  const casados = [];
  const ambiguos = [];
  const huerfanos = [];

  for (const [clave, suyos] of grupos) {
    suyos.sort((a, b) => a.orden - b.orden);
    const candidatas = indice.get(clave) ?? [];

    if (candidatas.length === 1) {
      casados.push({ clave, fila: candidatas[0], archivos: suyos });
    } else if (candidatas.length > 1) {
      ambiguos.push({ clave, candidatas, archivos: suyos });
    } else {
      huerfanos.push({ clave, archivos: suyos });
    }
  }

  // Y al revés: movimientos del CSV que no tienen ni un soporte. No es un
  // error —no todo gasto trae recibo— pero es la mitad de la pregunta.
  const conSoporte = new Set(casados.map((c) => c.fila.huella));
  const sinSoporte = filas.filter((f) => !conSoporte.has(f.huella));

  return { casados, ambiguos, huerfanos, sinSoporte };
}
