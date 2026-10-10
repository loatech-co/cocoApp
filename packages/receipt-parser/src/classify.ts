import { readAmount } from './amount';
import { readDate } from './date';
import { merchantsIn } from './dictionary';
import {
  indexTree,
  resolveTerms,
  readablePath,
  type ClassificationCertainty,
  type IndexEntry,
  type SearchableNode,
} from './search';
import {
  SIGNATURES,
  TYPED_TEXT_PRIORITY,
  COLLECTORS,
  normalize,
  type Signature,
} from './signatures';

/**
 * What this receipt is for, how much and when.
 *
 * ── Why several signals and not one ─────────────────────────────────────────
 * Because each signal fails in its own way. Embedded text is exact but is not
 * there in a scanned PDF. OCR is always there but confuses letters. The file
 * name is what a person wrote knowing what it was —the smartest signal— but
 * also the one nobody guarantees. Together they correct each other: where two
 * agree the third is not needed; where they disagree, the thing to do is not
 * to choose, it is to warn.
 *
 * ── Why the score is returned and not hidden ────────────────────────────────
 * Because an automatic classification that does not say how much it believes
 * itself forces reviewing everything or nothing. With the score, what is sure
 * goes through alone and what is doubtful goes to a queue, the only split that
 * really saves work.
 */

export interface ReadingSignals {
  /** Aliases from the content that matched. */
  text: string[];
  /** Pieces of the file name that matched. */
  name: string[];
  /** NITs that matched. The strongest signal. */
  nit: string[];
  /** Collectors found and ruled out as the creditor. */
  ignoredCollectors: string[];
}

/**
 * The classification carried to the person's tree, by ids.
 *
 * The names in `Reading` are for reading; this is for CHOOSING: a concept is
 * chosen by id, and two «Mercado» in different categories have the same name
 * and different ids. It only exists when the tree was passed.
 *
 * ── The three sources and their order ───────────────────────────────────────
 * `keywords` are the person's own —what they wrote in a concept to
 * recognise it— and go first; `signature` is the system catalogue; and
 * `dictionary` only speaks when neither of the other two recognised
 * anything. A lower source never replaces a higher one.
 *
 * ── And the certainty ───────────────────────────────────────────────────────
 * `high` is a concept; `medium` is a category or several concepts not chosen
 * between; `none` is not returned: then this is `null`.
 */
export interface TreeClassification {
  certainty: Exclude<ClassificationCertainty, 'none'>;
  /** The package never produces `history`: the API adds it, it owns the history. */
  source: 'history' | 'keywords' | 'signature' | 'dictionary';
  conceptId?: number | string | undefined;
  categoryId?: number | string | undefined;
  /** With medium certainty: what is in doubt, to keep it in sight. */
  candidates: { id: number | string; name: string; path: string }[];
}

export interface Reading {
  concept: string | null;
  category: string | null;
  costCenter: string | null;
  value: number | null;
  date: string | null;
  /** 0 to 1. Below 0.8 it goes to review. */
  confidence: number;
  signals: ReadingSignals;
  /** Why it was decided so, in one line, for the review queue. */
  reason: string;
  /** The other candidates, in case the person wants to correct in one click. */
  alternatives: { concept: string; score: number }[];
  /** By ids, when the tree was passed. `null` if it was not or led nowhere. */
  inTree?: TreeClassification | null;
}

export interface ReadingInput {
  /** The receipt's text: embedded in the PDF or out of the OCR. */
  text: string;
  /** How it was obtained. Embedded text is exact; OCR confuses letters. */
  source: 'texto-embebido' | 'ocr';
  /** The file name and, if there is one, its folder's. */
  fileName?: string | undefined;
  /** The month the expense belongs to, `YYYY-MM`. Helps choose the date. */
  period?: string | undefined;
  /** The signatures to use. The catalogue by default. */
  signatures?: Signature[];
  /**
   * The person's tree. With it, the reading returns ids and not only names,
   * and the system dictionary can look for its terms in it.
   */
  tree?: readonly SearchableNode[];
}

/** How much each signal weighs. They add up to 100 and the confidence comes from there. */
const WEIGHTS = {
  nit: 45,
  aliasInText: 30,
  tokenInName: 18,
  prefixInName: 10,
} as const;

export function classify(input: ReadingInput): Reading {
  const signatures = input.signatures ?? SIGNATURES;
  const text = normalize(input.text);
  const name = normalize(input.fileName ?? '');
  const index = input.tree ? indexTree(input.tree) : null;

  const signals: ReadingSignals = {
    text: [],
    name: [],
    nit: [],
    ignoredCollectors: [],
  };

  /*
    Collectors are noted and ruled out.

    They appear on almost every receipt because the money went through them.
    They stay in the signals on purpose: a report that says "I saw Bancolombia
    and ignored it" is what lets someone understand an odd classification
    without opening the file.
  */
  for (const collector of COLLECTORS) {
    if (text.includes(collector)) signals.ignoredCollectors.push(collector);
  }

  const scored = signatures.map((signature) => {
    let points = 0;
    const own: { text: string[]; name: string[]; nit: string[] } = {
      text: [],
      name: [],
      nit: [],
    };

    // What rules this signature out even if everything else matches.
    const isDiscarded = (signature.excludes ?? []).some((e) => text.includes(normalize(e)));

    for (const nit of signature.nits ?? []) {
      if (text.replace(/[.\s-]/g, '').includes(nit.replace(/[.\s-]/g, ''))) {
        points += WEIGHTS.nit;
        own.nit.push(nit);
      }
    }

    for (const alias of signature.alias) {
      if (text.includes(normalize(alias))) {
        points += WEIGHTS.aliasInText;
        own.text.push(alias);
        break;
      }
    }

    for (const token of signature.nameTokens ?? []) {
      if (name.includes(normalize(token))) {
        points += WEIGHTS.tokenInName;
        own.name.push(token);
      }
    }

    // Abbreviations only count anchored at the start: "AO" in the middle of a
    // word says nothing, "ao - agosto.pdf" does.
    for (const prefix of signature.namePrefixes ?? []) {
      if (new RegExp(`^${prefix}\\b`, 'i').test(name)) {
        points += WEIGHTS.prefixInName;
        own.name.push(prefix.toUpperCase());
      }
    }

    return {
      signature,
      points: isDiscarded ? 0 : points,
      own,
      isDiscarded,
    };
  });

  const alive = scored.filter((p) => p.points > 0);

  // Priority BEFORE score: it is what puts the PILA form above Sura when the
  // receipt says both.
  alive.sort(
    (a, b) => (b.signature.priority ?? 0) - (a.signature.priority ?? 0) || b.points - a.points,
  );

  const winner = alive[0];

  if (!winner) {
    const { value, date, valueConfidence } = valueAndDate(input, undefined);

    /*
      ── Last source: the system dictionary ─────────────────────────────────
      No signature recognised the creditor —neither the person's keywords nor
      the catalogue—. Before giving up, it checks whether the text names a
      merchant known in the country, and what THIS tree calls it: «KOBA
      COLOMBIA» is D1, D1 is «mercado», and mercado is whatever that person
      has with that name or as a keyword.

      Only with the tree at hand: without it there is nowhere to look the
      terms up, and returning «mercado» as a name would invent a concept that
      may not exist.
    */
    const dictionaryReading = index
      ? fromDictionary(index, input, signals, value, date, valueConfidence)
      : null;
    if (dictionaryReading) return dictionaryReading;

    return {
      concept: null,
      category: null,
      costCenter: null,
      value,
      date,
      // No creditor, no classification, however clear the amount is.
      confidence: Math.min(0.35, valueConfidence),
      signals,
      reason: 'No reconocí al acreedor en el texto ni en el nombre del archivo.',
      alternatives: [],
      inTree: null,
    };
  }

  signals.text = winner.own.text;
  signals.name = winner.own.name;
  signals.nit = winner.own.nit;

  const { value, date, valueConfidence } = valueAndDate(input, winner.signature);

  /*
    The confidence.

    It comes from three things and not one: how well the creditor was
    recognised, where the text came from —OCR makes mistakes and has to say
    so— and whether the amount was read from a line that names a total or
    pulled out by sheer guesswork.

    And it drops when the runner-up is close: two tied signatures are not a hit
    with reservations, they are a doubt.
  */
  const creditorScore = Math.min(1, winner.points / 60);
  const sourceFactor = input.source === 'texto-embebido' ? 1 : 0.8;
  /*
    The margin never drops below 0.6, which is what a tie is worth.

    The winner is not always the one with the most points: priority goes
    first, and a hand-written signature beats a catalogue one that recognised
    the NIT. Without a floor that subtraction turns negative and the creditor
    term does not lower the confidence: it SUBTRACTS, until it wipes out what
    the amount had already earned. A perfectly read receipt ended up with less
    confidence than one nothing was read from.

    Winning on priority and not on points is exactly a doubt, and a doubt is a
    tie: 0.6.
  */
  const runnerUp = alive[1];
  const margin =
    runnerUp && runnerUp.points > 0
      ? Math.max(0.6, Math.min(1, 0.6 + (winner.points - runnerUp.points) / 60))
      : 1;

  const confidence = Math.max(
    0,
    Math.min(1, creditorScore * 0.55 * sourceFactor * margin + valueConfidence * 0.45),
  );

  return {
    concept: winner.signature.concept,
    category: winner.signature.category,
    costCenter: winner.signature.costCenter,
    value,
    date,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    reason: reasonFor(winner.signature, signals, input.source),
    alternatives: alive.slice(1, 4).map((v) => ({ concept: v.signature.concept, score: v.points })),
    inTree: index ? treeClassificationFromSignature(index, winner.signature) : null,
  };
}

/**
 * A winning signature, carried to ids.
 *
 * The signature carries names —concept, category, cost center— because that
 * is how the catalogue is written and how `conceptSignatures` returns them.
 * The index is searched for the concept with the same name AND under the same
 * category: two «Mercado» in different categories are not the same.
 */
function treeClassificationFromSignature(
  index: readonly IndexEntry[],
  signature: Signature,
): TreeClassification {
  const concept = index.find(
    (e) =>
      e.level === 'concepto' &&
      normalize(e.name) === normalize(signature.concept) &&
      normalize(e.path[0] ?? '') === normalize(signature.category),
  );
  return {
    certainty: 'high',
    source: signature.priority === TYPED_TEXT_PRIORITY ? 'keywords' : 'signature',
    conceptId: concept?.id,
    categoryId: concept?.categoryId,
    candidates: [],
  };
}

/**
 * What the system dictionary says about a text, or `null` if nothing.
 *
 * The confidence stays ALWAYS below the review threshold, on purpose: the
 * dictionary proposes, it does not decide. A recognised merchant is a good
 * hint of where the money goes, but it is not a signature —it knows nothing
 * of THIS account—, and what comes out of here has to go past someone's eyes.
 */
function fromDictionary(
  index: readonly IndexEntry[],
  input: ReadingInput,
  signals: ReadingSignals,
  value: number | null,
  date: string | null,
  valueConfidence: number,
): Reading | null {
  const found = merchantsIn(`${input.text} ${input.fileName ?? ''}`);
  const [firstFound] = found;
  if (firstFound === undefined) return null;

  const terms = [...new Set(found.flatMap((h) => h.group.terms))];
  const resolved = resolveTerms(index, terms);
  if (resolved.certainty === 'none') return null;

  const concept = resolved.concept;
  const category =
    resolved.category ??
    (concept
      ? index.find((e) => e.level === 'categoria' && String(e.id) === String(concept.categoryId))
      : undefined);

  const merchant = firstFound.alias;
  const reason =
    resolved.certainty === 'high'
      ? `Reconocí «${merchant}» y en tu árbol eso lleva a un solo concepto.`
      : resolved.candidates.length > 1
        ? `Reconocí «${merchant}», pero en tu árbol lleva a ${resolved.candidates.length} sitios: elige tú.`
        : `Reconocí «${merchant}» y en tu árbol lleva a una categoría, sin concepto.`;

  return {
    concept: concept?.name ?? null,
    category: category?.name ?? null,
    costCenter: concept?.path[1] ?? category?.path[0] ?? null,
    value,
    date,
    confidence:
      resolved.certainty === 'high'
        ? Math.round(Math.min(0.75, 0.5 + valueConfidence * 0.25) * 100) / 100
        : Math.round(Math.min(0.5, 0.3 + valueConfidence * 0.2) * 100) / 100,
    signals,
    reason,
    alternatives: resolved.candidates.map((c) => ({ concept: c.name, score: 0 })),
    inTree: {
      certainty: resolved.certainty,
      source: 'dictionary',
      conceptId: concept?.id,
      categoryId: category?.id ?? concept?.categoryId,
      candidates: resolved.candidates.map((c) => ({
        id: c.id,
        name: c.name,
        path: readablePath(c),
      })),
    },
  };
}

/** The amount and the date, with whatever is known of the creditor. */
function valueAndDate(
  input: ReadingInput,
  signature: Signature | undefined,
): { value: number | null; date: string | null; valueConfidence: number } {
  const isPayroll = signature?.concept === 'PILA / Seguridad Social';
  const amount = readAmount(input.text, { isPayroll, range: signature?.range });
  const date = readDate(input.text, input.period);

  if (!amount) return { value: null, date: date?.iso ?? null, valueConfidence: 0 };

  let trust = amount.fromTotalLine ? 0.9 : 0.5;
  // Outside the range this creditor usually charges: it may be right —an
  // overdue bill, a year of insurance— but it deserves someone's look.
  if (
    signature?.range &&
    (amount.value < signature.range.min || amount.value > signature.range.max)
  ) {
    trust -= 0.35;
  }
  // A made-up date does not invalidate the amount, but it does not back it either.
  if (date && !date.inPeriod) trust -= 0.1;

  return {
    value: amount.value,
    date: date?.iso ?? null,
    valueConfidence: Math.max(0, Math.min(1, trust)),
  };
}

function reasonFor(signature: Signature, signals: ReadingSignals, source: string): string {
  const parts: string[] = [];
  if (signals.nit.length > 0) parts.push(`NIT ${signals.nit.join(', ')}`);
  if (signals.text.length > 0) parts.push(`“${signals.text.join('”, “')}” en el texto`);
  if (signals.name.length > 0) parts.push(`“${signals.name.join('”, “')}” en el nombre`);

  const cause = parts.length > 0 ? parts.join(' + ') : 'sin señales claras';
  const ignored =
    signals.ignoredCollectors.length > 0
      ? `. Ignoré ${signals.ignoredCollectors.join(', ')} por ser recaudador`
      : '';

  return `${signature.concept} por ${cause} (${source})${ignored}.`;
}

/** Below this, to the review queue. */
export const REVIEW_THRESHOLD = 0.8;

export function needsReview(reading: Reading): boolean {
  return (
    reading.confidence < REVIEW_THRESHOLD || reading.concept === null || reading.value === null
  );
}
