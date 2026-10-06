/**
 * Description normalization, for comparing what a receipt or a bank text
 * says against learned rules.
 *
 * It lived in `imports/fingerprint.ts` next to the import dedupe hash. The
 * import endpoints were retired in phase 6.6 and categorization is its only
 * user, so it moved here unchanged; the hash went with the importer.
 */

/**
 * Noise that statements put in the description and that changes between
 * readings of the SAME transaction. Left in, the fingerprint would never match
 * and the dedupe would be useless.
 */
const NOISE: RegExp[] = [
  // Transaction references: "REF 000123456", "AUT 45219".
  /\b(?:ref|aut|apr|autoriz\w*|comprobante|cus|doc)[\s.:#-]*\d{3,}\b/g,
  // Card fragments: "****1234", "XXXX 5678", "terminada en 1234".
  // No `\b` in front: between a space and a `*` there is NO word boundary
  // —neither is a word character— and the pattern would never match.
  /(?:[*x]{2,}\s*\d{4}|\bterminada\s+en\s+\d{4}\b)/g,
  // Embedded dates and times.
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
  // Bank boilerplate that does not tell one transaction from another.
  /\b(?:compra|pago|pse|debito|credito|transaccion|trans)\b/g,
];

/**
 * Normalizes a description for comparing.
 *
 * Lowercase, no accents, no noise, no punctuation and with collapsed spaces.
 * `Éxito Poblado  REF 0012` and `EXITO POBLADO ref 9987` end up as the same
 * string, which is exactly the point: the same merchant read twice.
 *
 * ── About ñ ────────────────────────────────────────────────────────────────
 * It folds into `n`, although in Spanish they are different letters. The
 * input of this function is OCR text, and the tilde is exactly the kind of
 * mark an OCR loses: the same merchant would come out "Peñalisa" once and
 * "Penalisa" another, and the fingerprint would stop matching — which is the
 * failure this function exists to avoid.
 *
 * The cost of folding is that two merchants that differ only by the ñ could
 * be flagged as repeated. For that they would ALSO have to match on account,
 * date and amount to the cent, and even then it is only flagged: the person
 * unticks the box. The opposite failure —duplicates slipping in unnoticed— is
 * much more expensive to find and to clean up.
 */
export function normalizeDescription(text: string | null | undefined): string {
  if (!text) return '';

  let result = text
    .toLowerCase()
    // NFD splits each letter from its diacritic; the range ̀-ͯ is
    // those marks. It includes the tilde of ñ, folded here on purpose.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  for (const pattern of NOISE) {
    result = result.replace(pattern, ' ');
  }

  return result
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
