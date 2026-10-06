import { normalizeDescription } from './description';
import type { English, SUGGESTION_REASON } from '../../common/vocabulary';

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
export const MIN_CONFIDENCE = 40;

export interface SuggestedCategory {
  categoryId: bigint;
  /** 0–100. Se enseña para que se sepa cuánto fiarse. */
  confidence: number;
  /** Por qué se sugirió. Aparece en la interfaz: "porque siempre lo clasificas así". */
  reason: English<typeof SUGGESTION_REASON>;
}

/** Un movimiento ya categorizado por la persona, para aprender de él. */
export interface HistoryEntry {
  description: string | null;
  categoryId: bigint;
}

export interface CategoryRule {
  pattern: string;
  categoryId: bigint;
  priority: number;
  /** Distingue lo que sembramos de lo que creó la persona. */
  isSeeded?: boolean;
}

/**
 * Elige la mejor sugerencia para una descripción.
 *
 * Devuelve `null` cuando nada alcanza `CONFIANZA_MINIMA`. Sugerir mal es peor
 * que no sugerir: una categoría equivocada que se cuela sin mirar contamina
 * los informes, y descubrirlo tres meses después cuesta mucho más que haber
 * escrito la categoría a mano.
 */
export function suggestCategory(
  description: string | null | undefined,
  context: { history: HistoryEntry[]; rules: CategoryRule[] },
): SuggestedCategory | null {
  const normalized = normalizeDescription(description);
  if (!normalized) return null;

  const historyMatch = fromHistory(normalized, context.history);
  if (historyMatch) return historyMatch;

  return fromRules(normalized, context.rules);
}

/**
 * Aprende del historial por coincidencia de tokens.
 *
 * No compara cadenas enteras: "rappi restaurante x" y "rappi mercado y" no son
 * iguales, pero comparten "rappi", que es lo que importa. Se puntúa cada
 * categoría por cuántos antecedentes comparten tokens significativos, y gana
 * la que domine con claridad.
 */
function fromHistory(normalized: string, history: HistoryEntry[]): SuggestedCategory | null {
  if (history.length === 0) return null;

  const tokens = significantTokens(normalized);
  if (tokens.size === 0) return null;

  const scores = new Map<bigint, number>();
  let total = 0;

  for (const entry of history) {
    const entryTokens = significantTokens(normalizeDescription(entry.description));
    if (entryTokens.size === 0) continue;

    let shared = 0;
    for (const token of tokens) {
      if (entryTokens.has(token)) shared += 1;
    }
    if (shared === 0) continue;

    // Un antecedente que comparte 2 de 2 tokens pesa más que uno que comparte
    // 1 de 5: se puntúa por proporción, no por conteo bruto.
    const peso = shared / Math.max(tokens.size, entryTokens.size);
    scores.set(entry.categoryId, (scores.get(entry.categoryId) ?? 0) + peso);
    total += peso;
  }

  if (total === 0) return null;

  const [winner, score] = [...scores.entries()].reduce((best, actual) =>
    actual[1] > best[1] ? actual : best,
  );

  // La confianza es cuánto DOMINA la ganadora sobre las demás, no cuántas
  // veces apareció. Si el historial está repartido entre tres categorías,
  // ninguna merece imponerse.
  const confidence = Math.round((score / total) * 100);

  return confidence >= MIN_CONFIDENCE
    ? { categoryId: winner, confidence, reason: 'history' }
    : null;
}

/** Aplica las reglas por palabra clave. Gana la de mayor prioridad. */
function fromRules(normalized: string, rules: CategoryRule[]): SuggestedCategory | null {
  const matches = rules
    .filter((rule) => rule.pattern.length > 0 && normalized.includes(rule.pattern))
    // A igualdad de prioridad gana el patrón más largo: "juan valdez" es más
    // específico que "juan" y debe ganarle.
    .sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length);

  const best = matches[0];
  if (!best) return null;

  return {
    categoryId: best.categoryId,
    // Una regla propia es una decisión explícita de la persona; una sembrada
    // es una suposición mía. La confianza lo refleja.
    confidence: best.isSeeded ? 60 : 85,
    reason: best.isSeeded ? 'seeded_rule' : 'rule',
  };
}

/**
 * Palabras que sí identifican un comercio.
 *
 * Fuera las de una y dos letras y las muy comunes: "de", "la", "el" aparecen
 * en medio catálogo y solo introducen ruido en la comparación.
 */
const STOP_WORDS = new Set([
  'de',
  'la',
  'el',
  'los',
  'las',
  'del',
  'y',
  'en',
  'sa',
  'sas',
  'ltda',
  'col',
  'colombia',
  'bogota',
  'medellin',
  'cali',
  'sucursal',
  'tienda',
]);

export function significantTokens(normalized: string): Set<string> {
  return new Set(
    normalized
      .split(' ')
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)),
  );
}

/**
 * Palabras que describen un pago sin decir de qué es.
 *
 * Aprender de ellas crea reglas que lo clasifican todo igual: una regla
 * «pago → Mercado» convertiría en mercado cada «pago de» que llegue después.
 * El plan lo dice tal cual: no se aprende de descripciones vacías ni genéricas.
 */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  'pago',
  'pagos',
  'compra',
  'compras',
  'transferencia',
  'transf',
  'abono',
  'abonos',
  'retiro',
  'consignacion',
  'factura',
  'facturas',
  'recibo',
  'recibos',
  'varios',
  'gasto',
  'gastos',
  'cuota',
  'cuotas',
  'mensualidad',
  'servicio',
  'servicios',
  'movimiento',
  'otros',
  'otro',
  'cargo',
  'debito',
  'credito',
  'tarjeta',
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
export function learnablePattern(
  description: string | null | undefined,
  normalize: (text: string) => string,
): string | null {
  const tokens = normalize(description ?? '')
    .split(' ')
    .filter((token) => token.length >= 4 && !/^\d+$/.test(token) && !GENERIC_WORDS.has(token));

  return tokens.sort((a, b) => b.length - a.length)[0] ?? null;
}
