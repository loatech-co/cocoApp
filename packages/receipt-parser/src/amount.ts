import { normalize } from './signatures';

/**
 * Cuánto se pagó, sacado de un recibo.
 *
 * ── Por qué no vale coger el número más grande ──────────────────────────────
 * Porque un recibo está lleno de números grandes que no son plata: el número
 * de la factura, el código de autorización, el CUS de una transacción, el NIT,
 * un IBC que no se paga, una dirección IP. Coger el mayor acierta a veces y
 * falla justo en los recibos que más importan.
 *
 * ── Cómo se decide ──────────────────────────────────────────────────────────
 * Cada candidato empieza en cero y suma por lo que lo hace parecer dinero
 * —está en una línea que dice "total a pagar", trae separador de miles, trae
 * un peso delante— y resta por lo que lo delata como identificador. El mayor
 * puntaje gana, y solo a igualdad de puntaje se mira el tamaño.
 */

/** Las líneas donde de verdad está lo que se pagó, de más a menos fiable. */
const TOTAL_LINES: { pattern: RegExp; points: number }[] = [
  { pattern: /valor\s+a\s+pagar/i, points: 10 },
  { pattern: /total\s+a\s+pagar/i, points: 10 },
  { pattern: /total\s+pagado/i, points: 10 },
  { pattern: /valor\s+pagado/i, points: 10 },
  { pattern: /neto\s+a\s+pagar/i, points: 9 },
  { pattern: /pago\s+total/i, points: 8 },
  { pattern: /total\s+factura/i, points: 8 },
  { pattern: /\btotal\b/i, points: 6 },
  { pattern: /\bvalor\b/i, points: 4 },
  { pattern: /\bpagar\b/i, points: 4 },
];

/**
 * Lo que descarta un número por completo.
 *
 * `IBC` es el caso más caro: en una planilla de la PILA es la base de
 * cotización —varios millones— y no se paga. Está en la misma página que el
 * valor a pagar y suele ser mayor.
 */
const RED_FLAGS: { pattern: RegExp; points: number }[] = [
  { pattern: /\bibc\b/i, points: -20 },
  { pattern: /ingreso\s+base/i, points: -20 },
  { pattern: /\bnit\b/i, points: -15 },
  { pattern: /\bcus\b/i, points: -15 },
  { pattern: /autorizaci[oó]n/i, points: -15 },
  { pattern: /n[uú]mero\s+de\s+(factura|recibo|referencia|operaci[oó]n)/i, points: -15 },
  {
    pattern: /\b(factura|recibo|referencia|radicado|planilla)\s*(no|n°|nro|#)?\s*:?\s*$/i,
    points: -8,
  },
  { pattern: /c[oó]digo/i, points: -10 },
  { pattern: /cuenta|contrato|suscriptor|medidor|poliza|póliza/i, points: -8 },
  { pattern: /tel[eé]fono|celular|whatsapp/i, points: -10 },
  { pattern: /lectura\s+(actual|anterior)/i, points: -8 },
  { pattern: /consumo|m3|kwh/i, points: -6 },
];

/** Un número tal como puede aparecer escrito: con miles, decimales o peso. */
const CANDIDATE =
  /\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\$\s?\d+(?:[.,]\d{1,2})?|\b\d{4,9}\b/g;

/**
 * Una IPv4 de verdad: los cuatro grupos de 0 a 255.
 *
 * Con un patrón laxo —`\d{1,3}(\.\d{1,3}){3}`— un monto como `3.321.802` no es
 * una IP, pero `1.234.567.890` sí lo parecería, y al revés: `192.168.1.1` se
 * colaría como monto. Estricto es la diferencia entre descartar una IP y
 * comerse tres millones de pesos.
 */
const IPV4 =
  /\b(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/;

export interface AmountCandidate {
  value: number;
  score: number;
  line: string;
  /** Si salió de una línea que nombra un total. Sube la confianza. */
  fromTotalLine: boolean;
}

/**
 * Convierte lo escrito en un número.
 *
 * La regla del separador es la misma que usa el importador de extractos: si
 * hay uno solo seguido de exactamente tres cifras, es de miles. `45.900` son
 * cuarenta y cinco mil novecientos pesos, y confundirlo con 45,90 deja el año
 * mil veces mal con una cifra que se ve plausible.
 */
export function toNumber(text: string): number | null {
  const clean = text.replace(/[$\s]/g, '');
  if (!/^\d[\d.,]*$/.test(clean)) return null;

  const dots = (clean.match(/\./g) ?? []).length;
  const commas = (clean.match(/,/g) ?? []).length;
  let integer = clean;
  let decimals = '';

  if (dots > 0 && commas > 0) {
    const decimal = clean.lastIndexOf('.') > clean.lastIndexOf(',') ? '.' : ',';
    const cut = clean.lastIndexOf(decimal);
    integer = clean.slice(0, cut);
    decimals = clean.slice(cut + 1);
  } else if (dots === 1 || commas === 1) {
    const separator = dots === 1 ? '.' : ',';
    // Hay exactamente un separador, así que siempre salen dos partes.
    const [left = '', right = ''] = clean.split(separator);
    if (right.length === 3) integer = left + right;
    else {
      integer = left;
      decimals = right;
    }
  }

  const parsed = Number(`${integer.replace(/[.,]/g, '')}.${decimals || '0'}`);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * El valor del recibo.
 *
 * `esPlanilla` cambia el criterio: en una planilla de la PILA el número mayor
 * es el IBC y el que se paga está en el resumen. Sin esa distinción, todas las
 * planillas salen con la base de cotización en vez de con el aporte.
 */
export function readAmount(
  text: string,
  options: { isPayroll?: boolean; range?: { min: number; max: number } | undefined } = {},
): AmountCandidate | null {
  const candidates: AmountCandidate[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    // Si la línea ES una IP, no hay nada que sacar de ella.
    const withoutIp = line.replace(IPV4, ' ');
    const normal = normalize(line);

    let context = 0;
    let isTotalLine = false;
    for (const { pattern, points } of TOTAL_LINES) {
      if (pattern.test(line)) {
        context = Math.max(context, points);
        isTotalLine = true;
        break;
      }
    }
    for (const { pattern, points } of RED_FLAGS) {
      if (pattern.test(line)) context += points;
    }

    // En una planilla, el IBC pesa tanto que conviene decirlo aparte.
    if (options.isPayroll && /\bibc\b|ingreso\s+base/i.test(line)) continue;

    for (const raw of withoutIp.match(CANDIDATE) ?? []) {
      const value = toNumber(raw);
      if (value === null || value <= 0) continue;

      let score = context;

      // Formato de dinero: separador de miles o peso delante. Un número
      // pelado de seis cifras puede ser un monto o un número de factura; uno
      // escrito `1.526.000` ya eligió ser dinero.
      if (/[.,]\d{3}/.test(raw)) score += 5;
      if (raw.includes('$')) score += 4;
      // Nadie paga 43 pesos, y un recibo de casa no llega a mil millones.
      if (value < 1000) score -= 6;
      if (value > 50_000_000) score -= 10;
      // Un año suelto no es plata.
      if (/^\d{4}$/.test(raw) && value >= 1900 && value <= 2100) score -= 12;
      // Una hora tampoco.
      if (/\d{1,2}:\d{2}/.test(line) && value < 10_000) score -= 4;
      // Y si cae en el rango que este acreedor suele cobrar, es buena señal.
      if (options.range && value >= options.range.min && value <= options.range.max) {
        score += 3;
      }

      candidates.push({
        value,
        score,
        line: normal.slice(0, 80),
        fromTotalLine: isTotalLine,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Puntaje primero; el tamaño solo desempata. Al revés, un número de factura
  // de nueve cifras le gana a un total de seis.
  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0] ?? null;
}
