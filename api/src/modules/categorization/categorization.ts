import { normalizarDescripcion } from '../imports/fingerprint';

/**
 * Categorización automática (T1) — lógica pura.
 *
 * ── El principio que manda ──────────────────────────────────────────────────
 * No-rigidez: el sistema SUGIERE, nunca decide ni bloquea. Un movimiento sin
 * categoría siempre se puede guardar. Por eso todo lo de aquí devuelve una
 * sugerencia con su confianza, y jamás lanza.
 *
 * ── De dónde sale la sugerencia, en orden de fuerza ─────────────────────────
 * 1. El HISTORIAL del propio usuario. Si ya clasificó "rappi" como Domicilios
 *    ocho veces, esa es la respuesta — y es mejor que cualquier lista que yo
 *    pudiera escribir, porque refleja cómo organiza SUS finanzas, no las mías.
 * 2. Reglas explícitas que la persona haya creado.
 * 3. Un puñado de reglas sembradas para Colombia, para que la primera
 *    importación de alguien que aún no tiene historial no llegue vacía.
 *
 * El historial gana siempre que exista. Las listas envejecen; el historial no.
 */

/** Confianza mínima para mostrar una sugerencia. Por debajo, mejor callar. */
export const CONFIANZA_MINIMA = 40;

export interface Sugerencia {
  categoryId: bigint;
  /** 0–100. Se enseña para que se sepa cuánto fiarse. */
  confidence: number;
  /** Por qué se sugirió. Aparece en la interfaz: "porque siempre lo clasificas así". */
  motivo: 'historial' | 'regla' | 'regla-sembrada';
}

/** Un movimiento ya categorizado por la persona, para aprender de él. */
export interface AntecedenteHistorico {
  description: string | null;
  categoryId: bigint;
}

export interface ReglaDeCategoria {
  pattern: string;
  categoryId: bigint;
  priority: number;
  /** Distingue lo que sembramos de lo que creó la persona. */
  sembrada?: boolean;
}

/**
 * Elige la mejor sugerencia para una descripción.
 *
 * Devuelve `null` cuando nada alcanza `CONFIANZA_MINIMA`. Sugerir mal es peor
 * que no sugerir: una categoría equivocada que se cuela sin mirar contamina
 * los informes, y descubrirlo tres meses después cuesta mucho más que haber
 * escrito la categoría a mano.
 */
export function sugerirCategoria(
  descripcion: string | null | undefined,
  contexto: { historial: AntecedenteHistorico[]; reglas: ReglaDeCategoria[] },
): Sugerencia | null {
  const normalizada = normalizarDescripcion(descripcion);
  if (!normalizada) return null;

  const delHistorial = desdeHistorial(normalizada, contexto.historial);
  if (delHistorial) return delHistorial;

  return desdeReglas(normalizada, contexto.reglas);
}

/**
 * Aprende del historial por coincidencia de tokens.
 *
 * No compara cadenas enteras: "rappi restaurante x" y "rappi mercado y" no son
 * iguales, pero comparten "rappi", que es lo que importa. Se puntúa cada
 * categoría por cuántos antecedentes comparten tokens significativos, y gana
 * la que domine con claridad.
 */
function desdeHistorial(
  normalizada: string,
  historial: AntecedenteHistorico[],
): Sugerencia | null {
  if (historial.length === 0) return null;

  const tokens = tokensSignificativos(normalizada);
  if (tokens.size === 0) return null;

  const puntajes = new Map<bigint, number>();
  let total = 0;

  for (const antecedente of historial) {
    const suyos = tokensSignificativos(normalizarDescripcion(antecedente.description));
    if (suyos.size === 0) continue;

    let comunes = 0;
    for (const token of tokens) {
      if (suyos.has(token)) comunes += 1;
    }
    if (comunes === 0) continue;

    // Un antecedente que comparte 2 de 2 tokens pesa más que uno que comparte
    // 1 de 5: se puntúa por proporción, no por conteo bruto.
    const peso = comunes / Math.max(tokens.size, suyos.size);
    puntajes.set(antecedente.categoryId, (puntajes.get(antecedente.categoryId) ?? 0) + peso);
    total += peso;
  }

  if (total === 0) return null;

  const [ganadora, puntaje] = [...puntajes.entries()].reduce((mejor, actual) =>
    actual[1] > mejor[1] ? actual : mejor,
  );

  // La confianza es cuánto DOMINA la ganadora sobre las demás, no cuántas
  // veces apareció. Si el historial está repartido entre tres categorías,
  // ninguna merece imponerse.
  const confidence = Math.round((puntaje / total) * 100);

  return confidence >= CONFIANZA_MINIMA
    ? { categoryId: ganadora, confidence, motivo: 'historial' }
    : null;
}

/** Aplica las reglas por palabra clave. Gana la de mayor prioridad. */
function desdeReglas(normalizada: string, reglas: ReglaDeCategoria[]): Sugerencia | null {
  const coincidencias = reglas
    .filter((regla) => regla.pattern.length > 0 && normalizada.includes(regla.pattern))
    // A igualdad de prioridad gana el patrón más largo: "juan valdez" es más
    // específico que "juan" y debe ganarle.
    .sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length);

  const mejor = coincidencias[0];
  if (!mejor) return null;

  return {
    categoryId: mejor.categoryId,
    // Una regla propia es una decisión explícita de la persona; una sembrada
    // es una suposición mía. La confianza lo refleja.
    confidence: mejor.sembrada ? 60 : 85,
    motivo: mejor.sembrada ? 'regla-sembrada' : 'regla',
  };
}

/**
 * Palabras que sí identifican un comercio.
 *
 * Fuera las de una y dos letras y las muy comunes: "de", "la", "el" aparecen
 * en medio catálogo y solo introducen ruido en la comparación.
 */
const VACIAS = new Set([
  'de', 'la', 'el', 'los', 'las', 'del', 'y', 'en', 'sa', 'sas', 'ltda',
  'col', 'colombia', 'bogota', 'medellin', 'cali', 'sucursal', 'tienda',
]);

export function tokensSignificativos(normalizada: string): Set<string> {
  return new Set(
    normalizada
      .split(' ')
      .filter((token) => token.length >= 3 && !VACIAS.has(token) && !/^\d+$/.test(token)),
  );
}

/**
 * Palabras que describen un pago sin decir de qué es.
 *
 * Aprender de ellas crea reglas que lo clasifican todo igual: una regla
 * «pago → Mercado» convertiría en mercado cada «pago de» que llegue después.
 * El plan lo dice tal cual: no se aprende de descripciones vacías ni genéricas.
 */
export const PALABRAS_GENERICAS: ReadonlySet<string> = new Set([
  'pago', 'pagos', 'compra', 'compras', 'transferencia', 'transf', 'abono', 'abonos',
  'retiro', 'consignacion', 'factura', 'facturas', 'recibo', 'recibos', 'varios',
  'gasto', 'gastos', 'cuota', 'cuotas', 'mensualidad', 'servicio', 'servicios',
  'movimiento', 'otros', 'otro', 'cargo', 'debito', 'credito', 'tarjeta',
]);

/**
 * El token con el que se aprende de una descripción, o `null` si no da para
 * aprender nada.
 *
 * El más largo, de cuatro letras o más, que no sea un número ni una palabra
 * genérica. De «RAPPI*RESTAURANTE EL SITIO» sale «restaurante». No es
 * perfecto —a veces el token más largo no es el nombre del comercio— pero la
 * regla convive con el aprendizaje por historial, que corrige por su cuenta,
 * y una regla mala pesa poco frente a un historial consistente.
 */
export function patronParaAprender(
  descripcion: string | null | undefined,
  normalizar: (texto: string) => string,
): string | null {
  const tokens = normalizar(descripcion ?? '')
    .split(' ')
    .filter((token) => token.length >= 4 && !/^\d+$/.test(token) && !PALABRAS_GENERICAS.has(token));

  return tokens.sort((a, b) => b.length - a.length)[0] ?? null;
}
