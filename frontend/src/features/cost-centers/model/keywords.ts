import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { toSearchableNodes } from '@/shared/lib/searchable-tree';
import {
  treeSignatures as sharedTreeSignatures,
  normalize,
  type Signature,
} from '@coco/receipt-parser';

/**
 * The words someone writes in a concept so that its receipts are
 * recognized on their own.
 *
 * ── Why the user has to be able to write them ───────────────────────────────
 * Because the signature catalog —`packages/receipt-parser/src/signatures.ts`— was drawn from 443
 * real receipts, and that is exactly what happens to it: it knows how to recognize the
 * creditors of WHOEVER brought them. The first receipt from a real estate agency that is not
 * in there is not recognized, and the only way out was to open the code.
 *
 * With keywords, whoever has the receipt in front of them writes what it says
 * —«Comfandi», the NIT— and the next one is classified on its own. It is the same deal
 * statement categorization already has, which learns from history: the
 * system does not guess better than the person, it learns from them.
 *
 * ── What is NOT done here ───────────────────────────────────────────────────
 * Saving the words in lowercase and without accents. They are compared that way, but they
 * are saved as they were written: «Aquaoccidente» in the form has to keep
 * saying «Aquaoccidente».
 */

/**
 * The minimum length of a keyword.
 *
 * Two letters show up INSIDE other words —«ao» is in «pago», «da» in
 * «fecha»— and a signature that matches any receipt does not classify: it sweeps.
 * The catalog has two-letter abbreviations, but anchored to the start of the
 * file name (`namePrefixes`), which is something else; what is written
 * here is searched for loose across the whole text.
 */
export const MIN_LENGTH = 3;

/** What the API accepts. Repeated here so as not to allow writing what is going to be rejected. */
export const MAX_KEYWORDS = 30;
const MAX_LENGTH = 60;

/** Without accents, in lowercase and with the spaces squeezed. For comparing, not for saving. */
function comparisonKey(keyword: string): string {
  return normalize(keyword);
}

/**
 * Trims and squeezes the spaces. What gets saved: with its accents and its
 * capital letters.
 */
export function cleanKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, ' ').trim();
}

/** Does this list already have this word? Ignoring accents and capitals. */
export function includesKeyword(keywords: readonly string[], keyword: string): boolean {
  const wanted = comparisonKey(keyword);
  return keywords.some((kept) => comparisonKey(kept) === wanted);
}

/**
 * Splits what was typed or pasted into separate words.
 *
 * The comma separates because that is how a list is pasted —«Celsia, EPSA, 805027653»—
 * and because nobody writes a creditor with a comma inside. The line break,
 * because copying three lines from a receipt is the other gesture.
 */
export function splitKeywords(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map(cleanKeyword)
    .filter((keyword) => keyword !== '');
}

/** Why a word is not accepted. `null` if it is. */
export function rejectionReason(keyword: string, existing: readonly string[]): string | null {
  const cleaned = cleanKeyword(keyword);

  if (cleaned.length < MIN_LENGTH) {
    return t('centers.keywords.tooShort', { word: cleaned, min: MIN_LENGTH });
  }
  if (cleaned.length > MAX_LENGTH) {
    return t('centers.keywords.tooLong', { start: cleaned.slice(0, 20) });
  }
  if (includesKeyword(existing, cleaned)) {
    return t('centers.keywords.duplicate', { word: cleaned });
  }
  if (existing.length >= MAX_KEYWORDS) {
    return t('centers.keywords.tooMany', { max: MAX_KEYWORDS });
  }

  return null;
}

/** The concepts of the tree: the leaves, which is where the transactions hang. */
function conceptsOf(tree: readonly CategoryTree[]): {
  concept: CategoryTree;
  category: CategoryTree;
  costCenter: CategoryTree;
}[] {
  return tree.flatMap((costCenter) =>
    (costCenter.children ?? []).flatMap((category) =>
      (category.children ?? []).map((concept) => ({ concept, category, costCenter })),
    ),
  );
}

/**
 * Which OTHER concept already uses this word.
 *
 * ── Why it warns instead of forbidding it ───────────────────────────────────
 * Because a word in two concepts breaks nothing —the classifier picks one
 * and moves on— but it does make the same bill land one month in «Energía» and another
 * in «Internet» without anyone understanding why. It is the same kind of warning as
 * the one for a duplicate concept: it says what there is and lets the person decide.
 */
export function conceptAlreadyUsing(
  tree: readonly CategoryTree[],
  keyword: string,
  exceptId?: CategoryTree['id'],
): CategoryTree | undefined {
  const wanted = comparisonKey(keyword);

  return conceptsOf(tree).find(
    ({ concept }) =>
      concept.id !== exceptId && concept.keywords.some((kept) => comparisonKey(kept) === wanted),
  )?.concept;
}

/**
 * The signatures that come out of someone's tree.
 *
 * They go IN FRONT of the catalog when classifying, and with higher priority too:
 * see `TYPED_TEXT_PRIORITY` in `packages/receipt-parser/src/signatures.ts`.
 */
export function treeSignatures(tree: readonly CategoryTree[]): Signature[] {
  // The traversal lives in the package since phase 3: the API needs it too.
  return sharedTreeSignatures(toSearchableNodes(tree));
}
