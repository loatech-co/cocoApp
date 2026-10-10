import {
  SIGNATURES,
  classify,
  treeSignatures,
  indexTree,
  readablePath,
  type IndexEntry,
  type SearchableNode,
} from '@coco/receipt-parser';

/**
 * The brain: from a text or some data, to an interpreted expense.
 *
 * ── Why it lives in the API and not only in the browser ─────────────────────
 * Interpretation lived in `@coco/receipt-parser` and ran only in the browser.
 * The API did not classify, did not know where an expense came from and threw
 * away the text it read; an external app had nobody to ask. Now the package
 * runs here as is —it was neither moved nor duplicated— and the web uses the
 * same engine.
 *
 * ── The sources, in order ───────────────────────────────────────────────────
 * 1. The person's HISTORY: what the server knows because it was classified
 *    that way before. It is available here, which is what the browser could
 *    not have.
 * 2. Their KEYWORDS, and the system's catalogue of signatures.
 * 3. The system's DICTIONARY, when nobody recognised the payee.
 * A lower source never replaces a higher one.
 *
 * ── And the certainty ───────────────────────────────────────────────────────
 * HIGH (`high`) is one concrete concept. MEDIUM (`medium`) is a category, or
 * several concepts with no choice among them. NONE (`none`) is nothing.
 * With anything short of high, the capture saves unclassified or with the
 * category, and flags it for review. It never guesses.
 *
 * It is a pure function: everything it needs —the tree, the history's
 * suggestion— comes from the caller, which is the one with the database.
 */
export type InterpretedCertainty = 'high' | 'medium' | 'none';
export type InterpretedSource = 'history' | 'keywords' | 'signature' | 'dictionary';

export interface InterpretationInput {
  /** Free text: the OCR of a receipt, the bank's SMS. */
  text?: string | null | undefined;
  /** Or data already structured, as the Wallet trigger sends it. */
  merchant?: string | null | undefined;
  amount?: string | number | null | undefined;
  /** `YYYY-MM-DD`. */
  date?: string | null | undefined;
  fileName?: string | null | undefined;
  /** The month it belongs to, `YYYY-MM`. Helps to pick the date. */
  period?: string | null | undefined;
}

export interface InterpretationContext {
  /** The person's tree, with ids as strings. */
  tree: readonly SearchableNode[];
  /** What the history suggests for this text, if anything. */
  history: { categoryId: string; confidence: number } | null;
  /** Today, `YYYY-MM-DD`, so a crooked OCR's future dates are not accepted. */
  today: string;
}

export interface InterpretedClassification {
  certainty: InterpretedCertainty;
  source: InterpretedSource | null;
  conceptId: string | null;
  categoryId: string | null;
  name: string | null;
  candidates: { id: string; name: string; path: string }[];
  reason: string;
}

export interface Interpreted {
  amount: string | null;
  date: string | null;
  merchant: string | null;
  description: string | null;
  classification: InterpretedClassification;
  needsReview: boolean;
}

/**
 * From this up, a history suggestion counts as HIGH certainty.
 *
 * The history answers with a dominance percentage: 100 when everything alike
 * went to the same category, 85 for a rule the person created, 60 for a
 * seeded rule. At 80 unanimity and the person's own rules get through, and
 * seeded rules and split histories stay out, which is exactly what should not
 * be saved without somebody looking at it.
 */
export const SAFE_HISTORY_CONFIDENCE = 80;

export function interpret(input: InterpretationInput, context: InterpretationContext): Interpreted {
  const index = indexTree(context.tree);
  const freeText = (input.text ?? '').trim();
  const merchant = (input.merchant ?? '').trim();

  // What it is given to read: the text if there is one; otherwise the merchant
  // alone. A merchant is a very short text, and the reader knows how to get the
  // payee out of it even with no amount or date to read.
  const reading = classify({
    text: freeText || merchant,
    source: 'texto-embebido',
    fileName: input.fileName ?? undefined,
    period: input.period ?? undefined,
    signatures: [...treeSignatures(context.tree), ...SIGNATURES],
    tree: context.tree,
  });

  // Structured data wins over what was read: if the capture already knows the
  // amount, there is nothing to guess from the text.
  const amount = amountOf(input.amount) ?? (reading.value === null ? null : String(reading.value));
  const date = validDate(input.date, context.today) ?? validDate(reading.date, context.today);

  const classification = classifyWith(context, index, reading.inTree ?? null, {
    concept: reading.concept,
    category: reading.category,
    reason: reading.reason,
  });

  return {
    amount,
    date,
    merchant: merchant || reading.concept || null,
    // The description is what the table shows at a glance: the merchant if
    // known; otherwise the recognised concept; otherwise nothing.
    description: merchant || reading.concept || null,
    classification,
    // Something is missing that somebody has to fill in —the amount, the date—
    // or the classification is not certain: flag it for review.
    needsReview: classification.certainty !== 'high' || amount === null || date === null,
  };
}

function classifyWith(
  context: InterpretationContext,
  index: readonly IndexEntry[],
  inTree: NonNullable<ReturnType<typeof classify>['inTree']> | null,
  parsed: { concept: string | null; category: string | null; reason: string },
): InterpretedClassification {
  return (
    byHistory(context, index) ??
    (inTree ? byReading(index, inTree, parsed) : null) ?? {
      certainty: 'none',
      source: null,
      conceptId: null,
      categoryId: null,
      name: null,
      candidates: [],
      reason: parsed.reason,
    }
  );
}

/** 1. The history, if it has something to say. */
function byHistory(
  context: InterpretationContext,
  index: readonly IndexEntry[],
): InterpretedClassification | null {
  const { history } = context;
  if (history) {
    const entry = index.find((e) => String(e.id) === history.categoryId);
    if (entry && entry.level !== 'centro') {
      const isHigh = history.confidence >= SAFE_HISTORY_CONFIDENCE;
      return {
        certainty: isHigh ? 'high' : 'medium',
        source: 'history',
        conceptId: entry.level === 'concepto' ? String(entry.id) : null,
        categoryId: entry.level === 'concepto' ? String(entry.categoryId) : String(entry.id),
        name: entry.name,
        candidates: isHigh
          ? []
          : [{ id: String(entry.id), name: entry.name, path: readablePath(entry) }],
        reason: isHigh
          ? `Tu historial lo clasifica así (${history.confidence}% de las veces).`
          : `Tu historial apunta aquí, pero no siempre (${history.confidence}%): mejor míralo.`,
      };
    }
  }
  return null;
}

/** 2 and 3. What the reading recognised, by keywords, signature or dictionary. */
function byReading(
  index: readonly IndexEntry[],
  inTree: NonNullable<ReturnType<typeof classify>['inTree']>,
  parsed: { reason: string; concept: string | null; category: string | null },
): InterpretedClassification {
  const concept =
    inTree.conceptId !== undefined
      ? index.find((e) => String(e.id) === String(inTree.conceptId))
      : undefined;
  const category =
    inTree.categoryId !== undefined
      ? index.find((e) => String(e.id) === String(inTree.categoryId))
      : undefined;
  return {
    certainty: inTree.certainty,
    source: inTree.source,
    conceptId: concept ? String(concept.id) : null,
    categoryId: category ? String(category.id) : concept ? String(concept.categoryId) : null,
    name: concept?.name ?? category?.name ?? parsed.concept ?? parsed.category,
    candidates: inTree.candidates.map((c) => ({
      id: String(c.id),
      name: c.name,
      path: c.path,
    })),
    reason: parsed.reason,
  };
}

/** A structured amount, as a decimal string, or `null` if it is no good. */
function amountOf(amount: string | number | null | undefined): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = typeof amount === 'number' ? amount : Number(amount.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/** `YYYY-MM-DD`, a real date and not a future one. Anything else is `null`. */
function validDate(date: string | null | undefined, today: string): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (Number.isNaN(Date.parse(date))) return null;
  if (date > today) return null;
  return date;
}

/**
 * For a notification: «Registrado: $45.000 · Alimentación», or «Pendiente de
 * clasificar». Three words, which is how a notification is read.
 */
export function summaryOf(
  amount: string | null,
  classification: InterpretedClassification,
): string {
  const shownAmount = amount === null ? null : pesos(amount);
  if (classification.certainty === 'high' && classification.name) {
    return `Registrado: ${shownAmount ?? 'sin valor'} · ${classification.name}`;
  }
  if (classification.certainty === 'medium' && classification.name) {
    return `Registrado: ${shownAmount ?? 'sin valor'} · ${classification.name} (por revisar)`;
  }
  return shownAmount
    ? `Registrado: ${shownAmount} · Pendiente de clasificar`
    : 'Pendiente de clasificar';
}

/** `45000` → `$45.000`. No decimals: that is how money is written here. */
export function pesos(amount: string | number): string {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.abs(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}
