/**
 * Cuándo se pagó, sacado de un recibo.
 *
 * Tres formas conviven en los recibos colombianos y ninguna es negociable:
 *   `04/01/2022` · `2022-01-04` · `04 Enero 2022` · `31-octubre-2023` · `04/ene/2022`
 *
 * ── La ambigüedad de 04/01 ──────────────────────────────────────────────────
 * ¿4 de enero u 1 de abril? En Colombia el orden es DÍA/MES. El ISO
 * `2022-01-04` se reconoce aparte por su forma, que es inconfundible.
 *
 * ── Por qué se prefiere la del periodo ──────────────────────────────────────
 * Un recibo trae varias fechas: la de expedición, la de vencimiento, la de
 * suspensión, la del próximo corte. La que interesa es la del pago, y la única
 * pista fiable de cuál es esa es el mes al que pertenece el gasto: entre todas
 * las que se leen, la que cae en ese mes.
 */

const MESES: Record<string, number> = {
  ene: 1,
  enero: 1,
  feb: 2,
  febrero: 2,
  mar: 3,
  marzo: 3,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  jul: 7,
  julio: 7,
  ago: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  setiembre: 9,
  oct: 10,
  octubre: 10,
  nov: 11,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
};

const ISO = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
const DIA_MES_ANIO = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/g;
const CON_MES_EN_PALABRA = new RegExp(
  String.raw`\b(\d{1,2})\s*[-/ ]?\s*(?:de\s+)?(${Object.keys(MESES).join('|')})\w*\s*[-/ ]?\s*(?:de\s+)?(20\d{2})\b`,
  'gi',
);

export interface FechaCandidata {
  iso: string;
  /** Si cae dentro del mes al que pertenece el gasto. */
  enElPeriodo: boolean;
}

const valida = (a: number, m: number, d: number): boolean =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 2000 && a <= 2100;

const aIso = (a: number, m: number, d: number): string =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Todas las fechas que aparecen, en el orden en que aparecen. */
export function fechasDe(texto: string): string[] {
  const encontradas: string[] = [];
  const anotar = (a: number, m: number, d: number): void => {
    if (valida(a, m, d)) encontradas.push(aIso(a, m, d));
  };

  // Los grupos de los tres patrones son obligatorios: los `= ''` nunca se usan.
  for (const [, a = '', m = '', d = ''] of texto.matchAll(ISO)) anotar(+a, +m, +d);
  for (const [, d = '', m = '', a = ''] of texto.matchAll(DIA_MES_ANIO)) {
    // Dos cifras de año: 22 es 2022, no 1922. Estos recibos no son de antes.
    anotar(a.length === 2 ? 2000 + +a : +a, +m, +d);
  }
  for (const [, d = '', mes = '', a = ''] of texto.matchAll(CON_MES_EN_PALABRA)) {
    const m = MESES[mes.toLowerCase().slice(0, 4)] ?? MESES[mes.toLowerCase().slice(0, 3)];
    if (m) anotar(+a, m, +d);
  }

  return [...new Set(encontradas)];
}

/**
 * La fecha del pago.
 *
 * `periodo` es el mes al que pertenece el gasto, en `YYYY-MM`. Si hay una
 * fecha de ese mes, es esa. Si no hay ninguna legible, se cae al día 15: es el
 * medio del mes, así que el error máximo es de dos semanas y nunca cae en otro
 * mes —que es el error que descuadra un resumen—.
 */
export function leerFecha(texto: string, periodo?: string): FechaCandidata | null {
  const todas = fechasDe(texto);

  if (periodo) {
    const delPeriodo = todas.filter((f) => f.startsWith(periodo));
    // La primera del mes: en un recibo, la de expedición va antes que la de
    // vencimiento, y la que se pagó se parece más a la primera.
    const [primeraDelPeriodo] = delPeriodo;
    if (primeraDelPeriodo !== undefined) return { iso: primeraDelPeriodo, enElPeriodo: true };
  }

  const [primera] = todas;
  if (primera !== undefined) return { iso: primera, enElPeriodo: false };
  if (periodo) return { iso: `${periodo}-15`, enElPeriodo: false };
  return null;
}
