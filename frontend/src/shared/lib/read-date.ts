/**
 * Lectura de una fecha escrita por una persona o por un banco.
 *
 * Vive en `lib` y no en la importación porque la usan las dos: el CSV de un
 * extracto y el campo de fecha de un formulario, donde se puede escribir en
 * vez de abrir el calendario. Es el mismo problema —un texto que hay que
 * entender— y una segunda copia acabaría entendiendo cosas distintas según
 * dónde se escriba.
 *
 * Hay tres formas comunes y ninguna es negociable con el banco:
 *   `01/08/2026` · `2026-08-01` · `01 AGO` (sin año, dentro de un extracto mensual)
 *
 * ── La ambigüedad de 01/08 ──────────────────────────────────────────────────
 * ¿1 de agosto o 8 de enero? En Colombia el orden es DÍA/MES, y así se lee.
 * El formato ISO `2026-08-01` se reconoce aparte por su forma, que es
 * inconfundible.
 */

// The Spanish month names a receipt or a statement may use, by month number.
// They are data (what the bank writes), so they are strings and not keys.
const MONTHS: Record<string, number> = Object.fromEntries(
  [
    ['ene', 'enero'],
    ['feb', 'febrero'],
    ['mar', 'marzo'],
    ['abr', 'abril'],
    ['may', 'mayo'],
    ['jun', 'junio'],
    ['jul', 'julio'],
    ['ago', 'agosto'],
    ['sep', 'sept', 'septiembre'],
    ['oct', 'octubre'],
    ['nov', 'noviembre'],
    ['dic', 'diciembre'],
  ].flatMap((names, i) => names.map((name) => [name, i + 1])),
);

export interface ParsedDate {
  /** `YYYY-MM-DD`, que es lo que espera la API. */
  iso: string;
  start: number;
  end: number;
}

/** ISO primero: su forma es inconfundible y no hay que adivinar nada. */
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
/** Día/mes/año, con año de 2 o 4 dígitos, o sin año. */
const DAY_MONTH = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/;
/** `01 AGO 2026`, `1 de agosto`, `AGO 01`. */
const WITH_MONTH_NAME = new RegExp(
  String.raw`\b(?:(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,10})|([a-záéíóú]{3,10})\s*(\d{1,2}))\.?(?:\s+(?:de\s+)?(\d{4}))?\b`,
  'i',
);

/**
 * Encuentra la primera fecha de una línea.
 *
 * `anioPorDefecto` cubre el caso más común de todos: un extracto mensual que
 * escribe "01 AGO" sin año porque el año está en el encabezado. Sin él, cada
 * línea habría que corregirla a mano.
 */
export function findDate(line: string, defaultYear: number): ParsedDate | null {
  const iso = ISO.exec(line);
  if (iso) {
    return {
      iso: `${iso[1]}-${iso[2]}-${iso[3]}`,
      start: iso.index,
      end: iso.index + iso[0].length,
    };
  }

  const withMonth = WITH_MONTH_NAME.exec(line);
  if (withMonth) {
    const day = Number(withMonth[1] ?? withMonth[4]);
    const name = (withMonth[2] ?? withMonth[3] ?? '').toLowerCase();
    const month = MONTHS[stripAccents(name)];

    if (month && day >= 1 && day <= 31) {
      const year = withMonth[5] ? Number(withMonth[5]) : defaultYear;
      return build(year, month, day, withMonth.index, withMonth.index + withMonth[0].length);
    }
  }

  const dayMonth = DAY_MONTH.exec(line);
  if (dayMonth) {
    // Día primero: en Colombia 01/08 es el 1 de agosto, no el 8 de enero.
    const day = Number(dayMonth[1]);
    const month = Number(dayMonth[2]);
    const year = dayMonth[3] ? fullYear(Number(dayMonth[3])) : defaultYear;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return build(year, month, day, dayMonth.index, dayMonth.index + dayMonth[0].length);
    }
  }

  return null;
}

/** `26` → 2026. Los extractos con año de dos dígitos siguen existiendo. */
function fullYear(year: number): number {
  if (year >= 1000) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

/**
 * Arma la fecha comprobando que EXISTA.
 *
 * `31/02` no es una fecha; dejarla pasar la convertiría en el 3 de marzo al
 * guardarla, que es exactamente el tipo de error silencioso que descuadra un
 * extracto sin que nadie sepa por qué.
 */
function build(
  year: number,
  month: number,
  day: number,
  start: number,
  end: number,
): ParsedDate | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, start, end };
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
