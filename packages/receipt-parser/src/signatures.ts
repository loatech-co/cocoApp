/**
 * Signatures: the signals each creditor is recognised by.
 *
 * ── Why a table and not conditions spread through the code ──────────────────
 * Because this grows with every new receipt that arrives misclassified, and it
 * grows by ADDING: one more alias, one more NIT. Spread over `if`s, every
 * addition means reading the whole flow to know where it goes and what else it
 * will break. As data, a line is added and the tests say whether anything
 * moved.
 *
 * ── Why the NIT weighs more than the name ───────────────────────────────────
 * Because a trade name shows up anywhere on a receipt —in the ads on the back,
 * in the name of the collecting bank— and the NIT only shows up where it
 * identifies someone. It is the least ambiguous datum of a Colombian invoice.
 */

export interface Signature {
  /** The exact concept, as it exists in the category tree. */
  concept: string;
  category: string;
  costCenter: string;
  /** Legal and trade names as they appear in the text. */
  alias: string[];
  /** NIT without dots or check digit. The strongest signal. */
  nits?: string[];
  /**
   * Pieces that appear in the NAME of the file or its folder. A supporting
   * signal: whoever named a file already knew what it was.
   */
  nameTokens?: string[];
  /**
   * Abbreviations that only count ANCHORED at the start of the name. "AO" in
   * the middle of a word says nothing; "AO - agosto.pdf" does.
   */
  namePrefixes?: string[];
  /**
   * Words that RULE OUT this signature even when the alias matches. It is what
   * separates "Claro Hogar" from "Claro Movil" when the receipt says both.
   */
  excludes?: string[];
  /**
   * Breaks the tie when two signatures match. Higher wins.
   *
   * It exists because of a real case: a PILA form mentions "ARL Sura" and
   * "EPS Sura", so it matches Sura and Social Security at once. And it is
   * Social Security: what was paid is the form, Sura is only where one part
   * went.
   */
  priority?: number;
  /** Typical range in pesos. A value far outside lowers the confidence. */
  range?: { min: number; max: number };
}

/**
 * Banks and collectors: they are NOT the creditor.
 *
 * They appear on almost every receipt because the money went through them. A
 * classifier that takes them for the payee ends up with half the year in
 * "Bancolombia", which is not an expense: it is a pipe.
 */
export const COLLECTORS = [
  'bancolombia',
  'bbva',
  'scotiabank',
  'davivienda',
  'banco de bogota',
  'banco de bogotá',
  'banco popular',
  'colpatria',
  'itau',
  'itaú',
  'av villas',
  'fiduciaria',
  'fiducia',
  'pse',
  'zona pagos',
  'zonapagos',
  'efecty',
  'baloto',
  'nequi',
  'daviplata',
];

/**
 * The initial catalogue, taken from the 443 receipts already loaded.
 *
 * It was not invented: every alias and every exclusion is here because a real
 * receipt needed it.
 */
export const SIGNATURES: Signature[] = [
  // ── Utilities ───────────────────────────────────────────────────────────
  {
    concept: 'Aquaoccidente (Agua)',
    category: 'Servicios públicos',
    costCenter: 'Costos fijos',
    alias: ['aquaoccidente', 'acueducto', 'acuaoccidente'],
    namePrefixes: ['ao'],
    nameTokens: ['agua', 'aquaoccidente'],
    range: { min: 15_000, max: 400_000 },
  },
  {
    concept: 'Gases de Occidente (Gas)',
    category: 'Servicios públicos',
    costCenter: 'Costos fijos',
    alias: ['gases de occidente', 'gasoccidente', 'gases del occidente'],
    namePrefixes: ['go', 'gdo'],
    nameTokens: ['gas'],
    range: { min: 5_000, max: 300_000 },
  },
  {
    concept: 'Celsia (Energia)',
    category: 'Servicios públicos',
    costCenter: 'Costos fijos',
    // "celcia" with a c: it is how the OCR writes it when the logo is printed
    // in a narrow typeface.
    alias: ['celsia', 'celcia', 'epsa'],
    // Celsia's internet is another service, billed apart.
    excludes: ['internet', 'fibra'],
    nameTokens: ['energia', 'energía', 'luz', 'celsia'],
    range: { min: 20_000, max: 900_000 },
  },
  {
    concept: 'Claro Hogar',
    category: 'Servicios públicos',
    costCenter: 'Costos fijos',
    alias: ['claro', 'comcel'],
    // Without this, both Claro match every Claro receipt.
    nameTokens: ['hogar', 'multiplay'],
    priority: 2,
    range: { min: 30_000, max: 500_000 },
  },
  {
    concept: 'Claro Movil',
    category: 'Servicios públicos',
    costCenter: 'Costos fijos',
    alias: ['claro', 'comcel'],
    nameTokens: ['movil', 'móvil', 'celular', 'personal', 'corporativo', 'tuti'],
    priority: 2,
    range: { min: 20_000, max: 600_000 },
  },
  {
    concept: 'Movistar',
    category: 'Servicios públicos',
    costCenter: 'Costos fijos',
    alias: ['movistar', 'telefonica', 'telefónica', 'colombia telecomunicaciones'],
    nameTokens: ['movistar'],
    range: { min: 10_000, max: 600_000 },
  },

  // ── Social security ─────────────────────────────────────────────────────
  {
    concept: 'PILA / Seguridad Social',
    category: 'Seguridad social',
    costCenter: 'Costos fijos',
    alias: [
      'planilla',
      'aportes en linea',
      'aportes en línea',
      'pila',
      'colpensiones',
      'porvenir',
      'cotizante',
      'liquidacion de aportes',
      'liquidación de aportes',
    ],
    nameTokens: ['pila', 'seguridad social'],
    // Higher than Sura: a form mentions "ARL Sura" and "EPS Sura", and what
    // was paid is the form.
    priority: 9,
    range: { min: 100_000, max: 8_000_000 },
  },

  // ── Health and life ─────────────────────────────────────────────────────
  {
    concept: 'Sura',
    category: 'Salud y vida',
    costCenter: 'Costos fijos',
    alias: ['sura', 'suramericana'],
    priority: 1,
    range: { min: 50_000, max: 1_500_000 },
  },
  {
    concept: 'AXA Medicina Prepagada',
    category: 'Salud y vida',
    costCenter: 'Costos fijos',
    alias: ['axa', 'colpatria medicina', 'medicina prepagada'],
    nameTokens: ['medicina', 'prepagada', 'seguros de vida', 'hyc', 'h&c'],
    excludes: ['duster'],
    priority: 3,
    range: { min: 100_000, max: 2_000_000 },
  },
  {
    concept: 'Allianz (Seguro)',
    category: 'Salud y vida',
    costCenter: 'Costos fijos',
    alias: ['allianz'],
    range: { min: 50_000, max: 3_000_000 },
  },
  {
    concept: 'Seguros Bolivar',
    category: 'Salud y vida',
    costCenter: 'Costos fijos',
    alias: ['seguros bolivar', 'seguros bolívar', 'bolivar'],
    range: { min: 50_000, max: 3_000_000 },
  },

  // ── Vehicles ────────────────────────────────────────────────────────────
  {
    concept: 'AXA Seguro Duster',
    category: 'Vehículos',
    costCenter: 'Costos fijos',
    alias: ['axa'],
    nameTokens: ['duster'],
    // Above the prepaid health plan: the file names the Duster, and the text
    // of both says "AXA".
    priority: 4,
    range: { min: 100_000, max: 4_000_000 },
  },
  {
    concept: 'SOAT',
    category: 'Vehículos',
    costCenter: 'Costos fijos',
    alias: ['soat', 'seguro obligatorio'],
    nameTokens: ['soat'],
    priority: 5,
    range: { min: 200_000, max: 1_500_000 },
  },

  // ── Education ───────────────────────────────────────────────────────────
  {
    concept: 'Colegio Rafael Pombo',
    category: 'Educación',
    costCenter: 'Costos fijos',
    alias: ['rafael pombo', 'colegio rafael'],
    namePrefixes: ['rp'],
    nameTokens: ['pombo'],
    range: { min: 100_000, max: 3_000_000 },
  },
  {
    concept: 'Colegio Tuti',
    category: 'Educación',
    costCenter: 'Costos fijos',
    alias: ['colegio tuti'],
    nameTokens: ['colegio tuti'],
    range: { min: 100_000, max: 3_000_000 },
  },
];

/**
 * The priority of a signature a person wrote.
 *
 * Above every one in the catalogue —the highest is 9— and not by a little:
 * what someone wrote in their concept is not one more candidate, it is an
 * instruction. «If the receipt says Comfandi, it is this concept» wins even
 * when the catalogue recognises another creditor with more signals, because
 * the catalogue is my guesses and this is their account.
 */
export const TYPED_TEXT_PRIORITY = 100;

/** A concept of someone's tree, with what is searched to recognise it. */
export interface ConceptWithWords {
  concept: string;
  category: string;
  costCenter: string;
  /** As they were written. Normalised when comparing. */
  words: readonly string[];
}

/**
 * Turns someone's concepts into signatures.
 *
 * ── Why the same word goes to the text AND to the file name ─────────────────
 * Because it is the same word and the two places fail differently. In a
 * crooked scan the recognition eats the creditor's name, and all that is left
 * is a file called «comfandi agosto.pdf». The other way round —a digital PDF
 * named «documento (3).pdf»— the signal is in the text. Asking for two lists
 * would be asking for the same word to be written twice.
 *
 * A NIT written as a keyword goes in through `alias` and not `nits`, on
 * purpose: `nits` compares without dots or spaces, and what is typed by hand
 * into a text field can be anything —a name, a number, half a sentence—. It
 * is searched as is, which is what whoever wrote it expects.
 *
 * Concepts without words produce no signature: a signature without signals
 * never matches and only makes the walk longer.
 */
export function conceptSignatures(concepts: readonly ConceptWithWords[]): Signature[] {
  return concepts
    .filter((concept) => concept.words.length > 0)
    .map((concept) => ({
      concept: concept.concept,
      category: concept.category,
      costCenter: concept.costCenter,
      alias: [...concept.words],
      nameTokens: [...concept.words],
      priority: TYPED_TEXT_PRIORITY,
    }));
}

/** Without accents, lower case and with spaces normalised. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The concepts of a tree, with what it takes to recognise them.
 *
 * It is the walk the frontend did to get signatures out of the person's
 * keywords. It lives here because the API needs exactly the same one —the
 * brain moves to the server and has to read the same tree the same way—, and
 * two different walks is how a keyword works in the browser and not in the
 * API.
 *
 * It takes the minimal shape of a node so as not to depend on anyone's type:
 * the frontend's tree and the one the API builds from Prisma both fit.
 */
export function treeConceptsWithWords(
  roots: readonly {
    name: string;
    keywords?: readonly string[];
    children?: readonly {
      name: string;
      keywords?: readonly string[];
      children?: readonly { name: string; keywords?: readonly string[] }[];
    }[];
  }[],
): ConceptWithWords[] {
  return roots.flatMap((costCenter) =>
    (costCenter.children ?? []).flatMap((category) =>
      (category.children ?? []).map((concept) => ({
        concept: concept.name,
        category: category.name,
        costCenter: costCenter.name,
        words: concept.keywords ?? [],
      })),
    ),
  );
}

/** The signatures that come out of a tree's keywords. */
export function treeSignatures(roots: Parameters<typeof treeConceptsWithWords>[0]): Signature[] {
  return conceptSignatures(treeConceptsWithWords(roots));
}
