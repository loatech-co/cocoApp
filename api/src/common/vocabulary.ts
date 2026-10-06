/**
 * The words the database and the older code use (Spanish), and the ones the
 * domain speaks (English), for every closed set of values that crosses the
 * service boundary.
 *
 * The services hand out the English word; v1 puts the Spanish one back
 * (`presenters/v1`), and the v2 inputs are turned into the Spanish one for the
 * services that still take it (`toV1Value`). One table per set, used in both
 * directions, so the two can never disagree.
 */

export const PERIODICITY = {
  mensual: 'monthly',
  bimestral: 'bimonthly',
  trimestral: 'quarterly',
  semestral: 'semiannual',
  anual: 'annual',
} as const;

export const BREAKDOWN_LEVEL = {
  'centro de costos': 'cost_center',
  categoría: 'category',
  concepto: 'concept',
} as const;

export const GRANULARITY = { dia: 'day', mes: 'month' } as const;

export const CERTAINTY = { alta: 'high', media: 'medium', ninguna: 'none' } as const;

export const CLASSIFICATION_SOURCE = {
  historial: 'history',
  'palabras-clave': 'keywords',
  firma: 'signature',
  diccionario: 'dictionary',
} as const;

export const SUGGESTION_REASON = {
  historial: 'history',
  regla: 'rule',
  'regla-sembrada': 'seeded_rule',
} as const;

type Table = Readonly<Record<string, string>>;

/** The English word of each Spanish one in `T`. */
export type English<T extends Table> = T[keyof T];

/** The Spanish word that `T` turns into `V`. */
export type Spanish<T extends Table, V extends string> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

export function english<T extends Table, K extends keyof T>(table: T, word: K): T[K] {
  return table[word];
}

export function spanish<T extends Table, V extends English<T>>(table: T, word: V): Spanish<T, V> {
  const found = Object.keys(table).find((key) => table[key] === word);
  if (found === undefined) throw new Error(`No Spanish word for ${word}`);
  return found as Spanish<T, V>;
}
