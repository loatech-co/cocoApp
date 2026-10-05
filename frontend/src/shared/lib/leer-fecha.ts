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
  oct: 10,
  octubre: 10,
  nov: 11,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
};

export interface FechaLeida {
  /** `YYYY-MM-DD`, que es lo que espera la API. */
  iso: string;
  inicio: number;
  fin: number;
}

/** ISO primero: su forma es inconfundible y no hay que adivinar nada. */
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
/** Día/mes/año, con año de 2 o 4 dígitos, o sin año. */
const DIA_MES = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/;
/** `01 AGO 2026`, `1 de agosto`, `AGO 01`. */
const CON_NOMBRE_DE_MES = new RegExp(
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
export function encontrarFecha(linea: string, anioPorDefecto: number): FechaLeida | null {
  const iso = ISO.exec(linea);
  if (iso) {
    return {
      iso: `${iso[1]}-${iso[2]}-${iso[3]}`,
      inicio: iso.index,
      fin: iso.index + iso[0].length,
    };
  }

  const conMes = CON_NOMBRE_DE_MES.exec(linea);
  if (conMes) {
    const dia = Number(conMes[1] ?? conMes[4]);
    const nombre = (conMes[2] ?? conMes[3] ?? '').toLowerCase();
    const mes = MESES[quitarTildes(nombre)];

    if (mes && dia >= 1 && dia <= 31) {
      const anio = conMes[5] ? Number(conMes[5]) : anioPorDefecto;
      return armar(anio, mes, dia, conMes.index, conMes.index + conMes[0].length);
    }
  }

  const diaMes = DIA_MES.exec(linea);
  if (diaMes) {
    // Día primero: en Colombia 01/08 es el 1 de agosto, no el 8 de enero.
    const dia = Number(diaMes[1]);
    const mes = Number(diaMes[2]);
    const anio = diaMes[3] ? completarAnio(Number(diaMes[3])) : anioPorDefecto;

    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      return armar(anio, mes, dia, diaMes.index, diaMes.index + diaMes[0].length);
    }
  }

  return null;
}

/** `26` → 2026. Los extractos con año de dos dígitos siguen existiendo. */
function completarAnio(anio: number): number {
  if (anio >= 1000) return anio;
  return anio < 70 ? 2000 + anio : 1900 + anio;
}

/**
 * Arma la fecha comprobando que EXISTA.
 *
 * `31/02` no es una fecha; dejarla pasar la convertiría en el 3 de marzo al
 * guardarla, que es exactamente el tipo de error silencioso que descuadra un
 * extracto sin que nadie sepa por qué.
 */
function armar(
  anio: number,
  mes: number,
  dia: number,
  inicio: number,
  fin: number,
): FechaLeida | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;

  const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return { iso, inicio, fin };
}

function quitarTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
