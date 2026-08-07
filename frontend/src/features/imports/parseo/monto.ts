/**
 * Lectura de montos escritos como los escriben los bancos colombianos.
 *
 * Esta es la función más peligrosa del parser. Si confunde el separador de
 * miles con el decimal, `$45.900` se convierte en `45.90` y el extracto entero
 * queda mil veces mal — un error que, además, se ve plausible en pantalla.
 *
 * Por eso la regla está escrita explícitamente y cubierta de pruebas, en lugar
 * de delegar en `parseFloat`, que interpretaría `45.900` como 45.9.
 */

/** Lo que puede parecer un monto dentro de una línea de extracto. */
const MONTO = /-?\$?\s?\(?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\)?-?/g;

export interface MontoLeido {
  /** String decimal con dos decimales, listo para la API. Nunca `number`. */
  valor: string;
  /** Dónde empezaba en la línea. Sirve para separar la descripción. */
  inicio: number;
  fin: number;
  negativo: boolean;
}

/**
 * Decide dónde está el punto decimal.
 *
 * ── La regla ────────────────────────────────────────────────────────────────
 * · Si aparecen los DOS separadores, el último es el decimal:
 *   `1.234.567,89` → coma decimal · `1,234,567.89` → punto decimal.
 * · Si aparece uno solo y varias veces, es de miles: `1.234.567`.
 * · Si aparece uno solo y una vez:
 *     - seguido de EXACTAMENTE 3 dígitos → miles. `45.900` es cuarenta y cinco
 *       mil novecientos pesos, no cuarenta y cinco con noventa. En Colombia el
 *       peso no se escribe con centavos en la vida diaria, y ésta es la
 *       confusión que más caro cuesta.
 *     - seguido de 1 o 2 dígitos → decimal. `45,90`.
 */
export function normalizarMonto(texto: string): string | null {
  const limpio = texto.replace(/[$\s()]/g, '').replace(/-/g, '');
  if (!/\d/.test(limpio)) return null;

  const puntos = (limpio.match(/\./g) ?? []).length;
  const comas = (limpio.match(/,/g) ?? []).length;

  let entero: string;
  let decimales = '00';

  if (puntos > 0 && comas > 0) {
    const decimal = limpio.lastIndexOf('.') > limpio.lastIndexOf(',') ? '.' : ',';
    const corte = limpio.lastIndexOf(decimal);
    entero = limpio.slice(0, corte).replace(/[.,]/g, '');
    decimales = limpio.slice(corte + 1);
  } else if (puntos + comas === 0) {
    entero = limpio;
  } else {
    const separador = puntos > 0 ? '.' : ',';
    const partes = limpio.split(separador);
    const ultima = partes[partes.length - 1] ?? '';

    if (partes.length > 2 || ultima.length === 3) {
      // Miles.
      entero = partes.join('');
    } else {
      entero = partes.slice(0, -1).join('');
      decimales = ultima;
    }
  }

  if (!/^\d+$/.test(entero) || !/^\d{1,2}$/.test(decimales)) return null;

  return `${entero}.${decimales.padEnd(2, '0')}`;
}

/**
 * Encuentra todos los montos de una línea, en orden.
 *
 * Se detecta el negativo tanto por el guion como por los paréntesis, que es
 * como algunos extractos marcan los débitos: `(45.900)`.
 */
export function encontrarMontos(linea: string): MontoLeido[] {
  const resultados: MontoLeido[] = [];

  for (const coincidencia of linea.matchAll(MONTO)) {
    const bruto = coincidencia[0];
    const inicio = coincidencia.index;

    // Un número suelto de 1 o 2 dígitos casi nunca es un monto: suele ser un
    // día, un número de cuota o el resto de una referencia.
    const soloDigitos = bruto.replace(/\D/g, '');
    if (soloDigitos.length < 3) continue;

    const valor = normalizarMonto(bruto);
    if (!valor) continue;

    resultados.push({
      valor,
      inicio,
      fin: inicio + bruto.length,
      negativo: bruto.includes('(') || bruto.trimStart().startsWith('-') || bruto.endsWith('-'),
    });
  }

  return resultados;
}
