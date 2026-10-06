import { normalize } from './signatures';

/**
 * How much was paid, read from a receipt.
 *
 * ── Why taking the biggest number does not work ─────────────────────────────
 * Because a receipt is full of big numbers that are not money: the invoice
 * number, the authorisation code, the CUS of a transaction, the NIT, an IBC
 * that is not paid, an IP address. Taking the biggest is right sometimes and
 * wrong precisely on the receipts that matter most.
 *
 * ── How it is decided ───────────────────────────────────────────────────────
 * Every candidate starts at zero, adds for what makes it look like money —it
 * is on a line that says "total a pagar", it has a thousands separator, a peso
 * sign in front— and subtracts for what gives it away as an identifier. The
 * highest score wins, and size only counts on a tie.
 */

/** The lines where what was paid really is, from most to least reliable. */
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
 * What rules a number out.
 *
 * `IBC` is the most expensive case: on a PILA form it is the contribution base
 * —several million— and it is not paid. It sits on the same page as the
 * amount to pay and is usually bigger.
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

/** A number as it can be written: with thousands, decimals or a peso sign. */
const CANDIDATE =
  /\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\$\s?\d+(?:[.,]\d{1,2})?|\b\d{4,9}\b/g;

/**
 * A real IPv4: four groups from 0 to 255.
 *
 * With a loose pattern —`\d{1,3}(\.\d{1,3}){3}`— an amount like `3.321.802` is
 * not an IP, but `1.234.567.890` would look like one, and the other way round:
 * `192.168.1.1` would slip in as an amount. Being strict is the difference
 * between dropping an IP and swallowing three million pesos.
 */
const IPV4 =
  /\b(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/;

export interface AmountCandidate {
  value: number;
  score: number;
  line: string;
  /** Whether it came from a line that names a total. Raises the confidence. */
  fromTotalLine: boolean;
}

/**
 * Turns what is written into a number.
 *
 * The separator rule is the one the statement importer uses: a single
 * separator followed by exactly three digits is a thousands separator.
 * `45.900` is forty-five thousand nine hundred pesos, and taking it for 45.90
 * leaves the year a thousand times off with a figure that looks plausible.
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
    // There is exactly one separator, so there are always two parts.
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
 * The amount of the receipt.
 *
 * `isPayroll` changes the rule: on a PILA form the biggest number is the IBC
 * and the one paid is in the summary. Without that distinction every form
 * comes out with the contribution base instead of the contribution.
 */
export function readAmount(
  text: string,
  options: { isPayroll?: boolean; range?: { min: number; max: number } | undefined } = {},
): AmountCandidate | null {
  const candidates: AmountCandidate[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    // If the line IS an IP, there is nothing to take from it.
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

    // On a PILA form the IBC weighs so much that it is worth saying apart.
    if (options.isPayroll && /\bibc\b|ingreso\s+base/i.test(line)) continue;

    for (const raw of withoutIp.match(CANDIDATE) ?? []) {
      const value = toNumber(raw);
      if (value === null || value <= 0) continue;

      let score = context;

      // Money format: a thousands separator or a peso sign. A bare six-digit
      // number can be an amount or an invoice number; one written `1.526.000`
      // already chose to be money.
      if (/[.,]\d{3}/.test(raw)) score += 5;
      if (raw.includes('$')) score += 4;
      // Nobody pays 43 pesos, and a household receipt never reaches a billion.
      if (value < 1000) score -= 6;
      if (value > 50_000_000) score -= 10;
      // A year on its own is not money.
      if (/^\d{4}$/.test(raw) && value >= 1900 && value <= 2100) score -= 12;
      // Nor is a time of day.
      if (/\d{1,2}:\d{2}/.test(line) && value < 10_000) score -= 4;
      // And falling in the range this creditor usually charges is a good sign.
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

  // Score first; size only breaks ties. The other way round, a nine-digit
  // invoice number beats a six-digit total.
  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0] ?? null;
}
