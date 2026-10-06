/**
 * A concept's keywords: what is searched for in a receipt to know it belongs
 * to it.
 *
 * ── What this file does ─────────────────────────────────────────────────────
 * One thing: decide when two words are the SAME. "Celsia", "celsia " and
 * "CELSIA" are, and keeping all three would make the classifier score three
 * times for a single match on the receipt.
 *
 * It lives apart from the DTO because two very different places need it:
 * saving what a client sends, and merging two concepts —where the removed
 * one's words move to the kept one—. Written twice, one day one of them stops
 * looking at accents.
 *
 * They are stored AS they were written: lowercasing on save would turn
 * "Aquaoccidente" into "aquaoccidente" on the screen of whoever wrote it.
 * This is the comparison, not the storage.
 */

/** Without accents, lowercase and with squeezed spaces. For comparing. */
function comparisonKey(word: string): string {
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Trims and squeezes the spaces, keeping accents and case. */
function clean(word: string): string {
  return word.replace(/\s+/g, ' ').trim();
}

/**
 * One list without empties or repeats, in the order they came in.
 *
 * Order matters little for classifying —they all weigh the same— and a lot
 * for whoever reads them: reordering them would make the form show a
 * different list from the one that was written.
 */
export function mergeKeywords(...lists: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const list of lists) {
    for (const raw of list) {
      const word = clean(raw);
      if (word === '') continue;

      const key = comparisonKey(word);
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(word);
    }
  }

  return merged;
}
