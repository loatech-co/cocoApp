import { normalize } from './signatures';

/**
 * The system dictionary: Colombian merchants → generic terms.
 *
 * The terms and merchant names below are DATA: Spanish words searched for in
 * Spanish receipts and in Spanish category trees. They are not translated.
 *
 * ── Why it points to TERMS and not to categories ────────────────────────────
 * Because categories belong to each account. «D1» is not «Mercado»: it is a
 * shop where groceries are bought, and in someone's tree that can be called
 * «Mercado», «Supermercado» or «Víveres», or sit under «Alimentación» with no
 * concept. The dictionary turns the merchant into words, and the words are
 * searched in that person's tree with the same search as the sheet. What
 * comes out —a concept, a category, nothing— is theirs.
 *
 * ── Why it is in the code and not in a table ────────────────────────────────
 * Like `SIGNATURES` and `COLLECTORS`: it is system knowledge, nobody's data.
 * Versioned, it is reviewed the way code is reviewed, and phase 3 takes it to
 * the API without touching the schema.
 *
 * ── It is the LAST source ───────────────────────────────────────────────────
 * Below the person's history and their keywords. It only speaks when nobody
 * else has anything to say, and even then what it says goes through the
 * sheet before being saved. A wrong entry here proposes badly; it does not
 * classify badly.
 *
 * ── What goes in `merchants` ────────────────────────────────────────────────
 * What really shows up on a receipt or in a bank SMS: the trade name AND the
 * legal name, which is what the card terminal prints. «KOBA COLOMBIA» is D1
 * and «JERONIMO MARTINS» is Ara, and without that the dictionary would not
 * recognise the two most frequent supermarkets in the country.
 */
export interface DictionaryGroup {
  /** To read in a report. Never shown. */
  group: string;
  /** What is searched in the person's tree, by name and keyword. */
  terms: readonly string[];
  /** As they appear in the text. Normalised when comparing. */
  merchants: readonly string[];
}

export const DICTIONARY: readonly DictionaryGroup[] = [
  {
    group: 'mercado',
    terms: ['mercado', 'supermercado', 'viveres', 'alimentacion', 'despensa', 'tienda'],
    merchants: [
      'd1',
      'koba colombia',
      'koba',
      'ara',
      'jeronimo martins',
      'exito',
      'almacenes exito',
      'carulla',
      'olimpica',
      'supertiendas y droguerias olimpica',
      'jumbo',
      'cencosud',
      'alkosto',
      'makro',
      'pricesmart',
      'colsubsidio',
      'euro supermercado',
      'supermercados euro',
      'surtimax',
      'super inter',
      'zapatoca',
      'merqueo',
      'mercamio',
    ],
  },
  {
    group: 'restaurantes y domicilios',
    terms: [
      'restaurante',
      'restaurantes',
      'comida',
      'comidas',
      'domicilio',
      'domicilios',
      'almuerzo',
      'cena',
      'cafeteria',
    ],
    merchants: [
      'rappi',
      'didi food',
      'mcdonalds',
      'mcdonald',
      'mc donald',
      'arcos dorados',
      'frisby',
      'kokoriko',
      'el corral',
      'hamburguesas el corral',
      'crepes & waffles',
      'crepes y waffles',
      'crepes and waffles',
      'juan valdez',
      'starbucks',
      'subway',
      'kfc',
      'burger king',
      'dominos',
      "domino's",
      'papa johns',
      "papa john's",
      'sandwich qbano',
      'qbano',
      'presto',
      'tostao',
      'oma',
      'buffalo wings',
      'wok',
      'archies',
      "archie's",
    ],
  },
  {
    group: 'transporte',
    terms: ['transporte', 'taxi', 'pasajes', 'movilidad', 'parqueadero', 'parqueaderos'],
    merchants: [
      'uber',
      'cabify',
      'indrive',
      'indriver',
      'didi',
      'transmilenio',
      'tullave',
      'tu llave',
      'city parking',
      'parking international',
      'parqueadero',
      'parqueaderos',
    ],
  },
  {
    group: 'combustible',
    terms: ['gasolina', 'combustible', 'tanqueada', 'acpm', 'gas vehicular'],
    merchants: [
      'terpel',
      'primax',
      'texaco',
      'mobil',
      'esso',
      'biomax',
      'zeuss',
      'puma energy',
      'brio',
      'estacion de servicio',
      'eds',
    ],
  },
  {
    group: 'peajes',
    terms: ['peaje', 'peajes', 'vias', 'autopista'],
    merchants: ['peaje', 'peajes', 'flypass', 'facilpass', 'concesion vial', 'concesionaria'],
  },
  {
    group: 'farmacia',
    terms: ['farmacia', 'drogueria', 'medicamentos', 'medicinas', 'drogas'],
    merchants: [
      'farmatodo',
      'cruz verde',
      'la rebaja',
      'drogas la rebaja',
      'copservir',
      'locatel',
      'drogueria alemana',
      'droguerias alemana',
      'pasteur',
      'drogueria pasteur',
      'drogueria',
      'droguerias',
      'farmacia',
    ],
  },
  {
    group: 'servicios publicos',
    terms: [
      'servicios publicos',
      'agua',
      'luz',
      'energia',
      'gas',
      'acueducto',
      'aseo',
      'alcantarillado',
    ],
    merchants: [
      'epm',
      'empresas publicas de medellin',
      'emcali',
      'eaab',
      'acueducto de bogota',
      'acueducto',
      'enel',
      'codensa',
      'air-e',
      'afinia',
      'vanti',
      'triple a',
      'acuavalle',
      'veolia',
      'promoambiental',
      'celsia',
      'gases de occidente',
      'aquaoccidente',
      'essa',
      'chec',
      'electrohuila',
    ],
  },
  {
    group: 'telecomunicaciones',
    terms: ['internet', 'celular', 'telefonia', 'plan', 'datos', 'television', 'cable'],
    merchants: [
      'claro hogar',
      'claro movil',
      'claro',
      'comcel',
      'movistar',
      'telefonica',
      'tigo',
      'colombia movil',
      'etb',
      'wom',
      'directv',
      'virgin mobile',
    ],
  },
  {
    group: 'suscripciones digitales',
    terms: [
      'suscripcion',
      'suscripciones',
      'streaming',
      'licencias',
      'licencia',
      'apps',
      'software',
    ],
    merchants: [
      'netflix',
      'spotify',
      'disney plus',
      'disney+',
      'disneyplus',
      'hbo max',
      'hbomax',
      'hbo',
      'prime video',
      'amazon prime',
      'youtube premium',
      'youtube',
      'apple.com/bill',
      'apple.com bill',
      'itunes',
      'icloud',
      'google one',
      'google play',
      'microsoft 365',
      'office 365',
      'adobe',
      'dropbox',
      'canva',
      'openai',
      'chatgpt',
      'anthropic',
      'claude.ai',
      'notion',
      'paramount',
      'paramount+',
      'crunchyroll',
      'deezer',
    ],
  },
  {
    group: 'salud',
    terms: [
      'salud',
      'medico',
      'consulta',
      'examen',
      'examenes',
      'laboratorio',
      'eps',
      'prepagada',
      'odontologia',
      'clinica',
    ],
    merchants: [
      'sura',
      'eps sura',
      'sanitas',
      'colsanitas',
      'eps sanitas',
      'compensar',
      'nueva eps',
      'salud total',
      'famisanar',
      'coomeva',
      'axa colpatria',
      'colpatria medicina',
      'colmedica',
      'medplus',
      'colcan',
      'synlab',
      'dinamica ips',
      'clinica',
      'laboratorio clinico',
      'ips',
    ],
  },
  {
    group: 'educacion',
    terms: [
      'educacion',
      'colegio',
      'universidad',
      'matricula',
      'pension escolar',
      'curso',
      'cursos',
      'utiles',
    ],
    merchants: [
      'colegio',
      'universidad',
      'matricula',
      'pension escolar',
      'platzi',
      'coursera',
      'udemy',
      'duolingo',
      'panamericana libreria',
      'libreria panamericana',
      'libreria nacional',
      'libreria',
    ],
  },
];

/**
 * The pipelines: where the money went through, not where it went.
 *
 * `COLLECTORS` already covers the banks for reading receipts. This adds the
 * payment gateways that show up in purchase SMS —«Compra en MERCADO PAGO*D1»—
 * and that, left in the text, would mislead: «mercado pago» is not groceries.
 * They are removed from the text BEFORE looking for merchants, so the «d1»
 * that follows is found.
 *
 * `COLLECTORS` is not touched: that list decides what is NOT the creditor of a
 * receipt, and changing it belongs to receipt reading, not to this phase.
 */
export const PIPELINES: readonly string[] = [
  'mercado pago',
  'mercadopago',
  'payu',
  'wompi',
  'bold',
  'addi',
  'epayco',
  'payvalida',
];

export interface FoundMerchant {
  group: DictionaryGroup;
  /** The alias that appeared, as it is in the dictionary. */
  alias: string;
}

const ESCAPE = /[.*+?^${}()|[\]\\/]/g;

/**
 * Which dictionary merchants appear in a text, from most to least certain.
 *
 * ── Two rules that matter more than the list ────────────────────────────────
 * 1. It only counts between WORD BOUNDARIES. «ara» appears inside «para»,
 *    «compara» and «barato»; without this, everything that said «para» would
 *    be groceries. It holds for every alias, not only the short ones:
 *    «presto» is inside «prestamo».
 * 2. The LONGEST alias wins, and what it covers is consumed: «didi food» is
 *    delivery and plain «didi» is transport; once the first is found, the
 *    second can no longer appear inside it. Same with «claro hogar» and
 *    «claro».
 */
export function merchantsIn(text: string): FoundMerchant[] {
  let remaining = ` ${normalize(text)} `;
  for (const pipeline of PIPELINES) remaining = remaining.split(pipeline).join(' ');

  const candidates: { group: DictionaryGroup; alias: string; length: number }[] = [];
  for (const group of DICTIONARY) {
    for (const alias of group.merchants) candidates.push({ group, alias, length: alias.length });
  }
  candidates.sort((a, b) => b.length - a.length);

  const found: FoundMerchant[] = [];
  const seenGroups = new Set<string>();

  for (const { group, alias } of candidates) {
    const pattern = new RegExp(
      `(^|[^a-z0-9])(${normalize(alias).replace(ESCAPE, '\\$&')})(?=[^a-z0-9]|$)`,
    );
    const m = pattern.exec(remaining);
    if (!m) continue;

    // What was found is consumed so a shorter alias does not hit it again.
    // Spaces are left so word boundaries still hold. Both groups are
    // mandatory in the pattern: they always come.
    const [, before = '', match = ''] = m;
    const start = m.index + before.length;
    remaining = `${remaining.slice(0, start)} ${' '.repeat(match.length - 1)}${remaining.slice(start + match.length)}`;

    if (!seenGroups.has(group.group)) {
      seenGroups.add(group.group);
      found.push({ group, alias });
    }
  }

  return found;
}

/**
 * The generic terms a text suggests, in order of certainty.
 *
 * It is what is then searched in the person's tree. If several merchants
 * appear at once —«RAPPI*EXITO»—, the terms of the longest match go first;
 * whoever resolves them decides what to do with the mix.
 */
export function termsFor(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const { group } of merchantsIn(text)) {
    for (const t of group.terms) {
      if (!seen.has(t)) {
        seen.add(t);
        terms.push(t);
      }
    }
  }
  return terms;
}
