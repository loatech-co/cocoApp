import { normalizeDescription } from './description';
import type { English, SUGGESTION_REASON } from '../../common/vocabulary';

/**
 * Automatic categorization (T1) — pure logic.
 *
 * ── The ruling principle ────────────────────────────────────────────────────
 * No rigidity: the system SUGGESTS, it never decides or blocks. A transaction
 * without a category can always be saved. That is why everything here returns
 * a suggestion with its confidence, and never throws.
 *
 * ── Where the suggestion comes from, strongest first ────────────────────────
 * 1. The user's own HISTORY. If they already classified "rappi" as Domicilios
 *    eight times, that is the answer — and it beats any list I could write,
 *    because it reflects how THEY organize their finances, not how I do.
 * 2. Explicit rules the person created.
 * 3. A handful of rules seeded for Colombia, so the first import of someone
 *    with no history yet does not arrive empty.
 *
 * The history always wins when it exists. Lists age; the history does not.
 */

/** Minimum confidence to show a suggestion. Below it, better to stay quiet. */
export const MIN_CONFIDENCE = 40;

export interface SuggestedCategory {
  categoryId: bigint;
  /** 0–100. Shown so people know how much to trust it. */
  confidence: number;
  /** Why it was suggested. It shows in the interface: "because you always classify it this way". */
  reason: English<typeof SUGGESTION_REASON>;
}

/** A transaction the person already categorized, to learn from. */
export interface HistoryEntry {
  description: string | null;
  categoryId: bigint;
}

export interface CategoryRule {
  pattern: string;
  categoryId: bigint;
  priority: number;
  /** Tells what we seeded from what the person created. */
  isSeeded?: boolean;
}

/**
 * Picks the best suggestion for a description.
 *
 * Returns `null` when nothing reaches `MIN_CONFIDENCE`. A wrong suggestion is
 * worse than none: a wrong category that slips in unnoticed pollutes the
 * reports, and finding it three months later costs far more than having
 * typed the category by hand.
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
 * Learns from the history by token overlap.
 *
 * It does not compare whole strings: "rappi restaurante x" and "rappi mercado
 * y" are not equal, but they share "rappi", which is what matters. Each
 * category is scored by how many past transactions share significant tokens,
 * and the one that clearly dominates wins.
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

    // A past transaction sharing 2 of 2 tokens weighs more than one sharing
    // 1 of 5: it is scored by proportion, not by raw count.
    const peso = shared / Math.max(tokens.size, entryTokens.size);
    scores.set(entry.categoryId, (scores.get(entry.categoryId) ?? 0) + peso);
    total += peso;
  }

  if (total === 0) return null;

  const [winner, score] = [...scores.entries()].reduce((best, actual) =>
    actual[1] > best[1] ? actual : best,
  );

  // The confidence is how much the winner DOMINATES the rest, not how many
  // times it appeared. If the history is split among three categories, none
  // deserves to prevail.
  const confidence = Math.round((score / total) * 100);

  return confidence >= MIN_CONFIDENCE
    ? { categoryId: winner, confidence, reason: 'history' }
    : null;
}

/** Applies the keyword rules. The highest priority wins. */
function fromRules(normalized: string, rules: CategoryRule[]): SuggestedCategory | null {
  const matches = rules
    .filter((rule) => rule.pattern.length > 0 && normalized.includes(rule.pattern))
    // At equal priority the longest pattern wins: "juan valdez" is more
    // specific than "juan" and must beat it.
    .sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length);

  const best = matches[0];
  if (!best) return null;

  return {
    categoryId: best.categoryId,
    // An own rule is an explicit decision of the person; a seeded one is my
    // guess. The confidence reflects it.
    confidence: best.isSeeded ? 60 : 85,
    reason: best.isSeeded ? 'seeded_rule' : 'rule',
  };
}

/**
 * Words that do identify a merchant.
 *
 * Out go the one- and two-letter ones and the very common ones: "de", "la",
 * "el" show up in half the catalogue and only add noise to the comparison.
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
 * Words that describe a payment without saying what it is for.
 *
 * Learning from them creates rules that classify everything the same: a rule
 * "pago → Mercado" would turn every "pago de" that comes later into
 * groceries. The plan says it as is: nothing is learned from empty or generic
 * descriptions.
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
 * The token a description is learned with, or `null` if it is not enough to
 * learn anything.
 *
 * The longest one, four letters or more, that is neither a number nor a
 * generic word. «RAPPI*RESTAURANTE EL SITIO» gives «restaurante». It is not
 * perfect —sometimes the longest token is not the merchant's name— but the
 * rule lives alongside learning from the history, which corrects on its own,
 * and a bad rule weighs little against a consistent history.
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
