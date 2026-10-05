/**
 * The v1 → v2 translation of what the services return.
 *
 * v2 is the same API in English and camelCase (decisions.md, "Final
 * decisions"): the services keep returning their v1 views, and the v2
 * controllers pass them through `toV2` at the edge. One table, applied
 * everywhere, instead of a hand-written mapper per route: a field renamed in
 * one response and forgotten in another is exactly the drift a version bump is
 * supposed to end.
 *
 * Names come from `docs/standards/rename-map.json` (`jsonFields`,
 * `jsonValues`). A key that is not in `FIELD_NAMES` is only re-cased
 * (`created_at` → `createdAt`); one already in camelCase (`parentId`) is left
 * alone.
 *
 * `ToV2<T>` is the same translation done by the compiler, so the response
 * classes in this folder can be checked against it (`shapes.spec.ts`).
 */

/** v1 field → v2 field, where the change is more than the casing. */
export const FIELD_NAMES = {
  recurrente: 'isRecurring',
  estatico: 'isStatic',
  periodicidad: 'periodicity',
  dia_de_pago: 'paymentDay',
  mes_de_pago: 'paymentMonth',
  presupuesto: 'budget',
  pago_automatico: 'isAutoPaid',
  varios_pagos: 'isMultiPayment',
  palabras_clave: 'keywords',
  por_revisar: 'needsReview',
  clasificacion: 'classification',
  certeza: 'certainty',
  fuente: 'source',
  concepto_id: 'conceptId',
  categoria_id: 'categoryId',
  nombre: 'name',
  candidatos: 'candidates',
  ruta: 'path',
  motivo: 'reason',
  resumen: 'summary',
  repetido: 'isDuplicate',
  fusionado: 'isMerged',
  orden: 'position',
  nombre_archivo: 'fileName',
  tamano: 'sizeBytes',
  disponible: 'isAvailable',
  cuentas_habilitadas: 'accountsEnabled',
  centro_id: 'costCenterId',
  centro: 'costCenter',
  expense_by_center: 'expenseByCostCenter',
  movidos: 'moved',
  destino: 'target',
  movimientos: 'transactions',
  subcategorias: 'subcategories',
  creadas: 'created',
  aprendido: 'learned',
} as const;

/** v1 literal → v2 literal, per v1 field (the same word can mean two things). */
export const VALUE_NAMES = {
  periodicidad: {
    mensual: 'monthly',
    bimestral: 'bimonthly',
    trimestral: 'quarterly',
    semestral: 'semiannual',
    anual: 'annual',
  },
  breakdown_level: {
    'centro de costos': 'cost_center',
    categoría: 'category',
    concepto: 'concept',
  },
  granularity: { dia: 'day', mes: 'month' },
  certeza: { alta: 'high', media: 'medium', ninguna: 'none' },
  fuente: {
    historial: 'history',
    'palabras-clave': 'keywords',
    firma: 'signature',
    diccionario: 'dictionary',
  },
  reason: { historial: 'history', regla: 'rule', 'regla-sembrada': 'seeded_rule' },
} as const;

/**
 * Fields whose value is data, not structure: copied as they are. The audit
 * log's `changes` is whatever was recorded at the time; renaming keys inside
 * it would rewrite history.
 */
const OPAQUE = new Set(['changes']);

type FieldNames = typeof FIELD_NAMES;
type ValueNames = typeof VALUE_NAMES;

type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

type V2Key<K> = K extends keyof FieldNames ? FieldNames[K] : K extends string ? CamelCase<K> : K;

type V2Value<K, V> = K extends 'changes'
  ? V
  : K extends keyof ValueNames
    ? V extends keyof ValueNames[K]
      ? ValueNames[K][V]
      : V
    : ToV2<V>;

/** What `toV2` makes of a value of type `T`. */
export type ToV2<T> = T extends bigint | Date | string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? ToV2<U>[]
    : T extends object
      ? { [K in keyof T as V2Key<K>]: V2Value<K, T[K]> }
      : T;

function v2Key(key: string): string {
  if (key in FIELD_NAMES) return FIELD_NAMES[key as keyof FieldNames];
  return key.replace(/_([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

function v2Value(key: string, value: unknown): unknown {
  if (OPAQUE.has(key)) return value;
  if (key in VALUE_NAMES && typeof value === 'string') {
    const table: Readonly<Record<string, string>> = VALUE_NAMES[key as keyof ValueNames];
    return table[value] ?? value;
  }
  return translate(value);
}

function translate(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(translate);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [v2Key(key), v2Value(key, inner)]),
  );
}

/** A service's v1 view, as v2 sends it. */
export function toV2<T>(value: T): ToV2<T> {
  return translate(value) as ToV2<T>;
}

/**
 * v2 literal → v1 literal, for the inputs: the services still take the v1
 * words. The inverse of `VALUE_NAMES[field]`.
 */
export function toV1Value<F extends keyof ValueNames>(
  field: F,
  value: string,
): keyof ValueNames[F] {
  const table: Readonly<Record<string, string>> = VALUE_NAMES[field];
  const found = Object.entries(table).find(([, english]) => english === value);
  if (!found) throw new Error(`No v1 value for ${field} =${value}`);
  return found[0] as keyof ValueNames[F];
}

/** The v2 words of a field with translated values, for `@IsIn` and the document. */
export function v2Values<F extends keyof ValueNames>(
  field: F,
): ValueNames[F][keyof ValueNames[F]][] {
  return Object.values(VALUE_NAMES[field]) as ValueNames[F][keyof ValueNames[F]][];
}

/**
 * Copies the keys whose value is not `undefined`.
 *
 * A v2 input becomes a v1 DTO for the service, and the services tell "not
 * sent" from "sent as null" (`category_id: null` clears the category; absent
 * leaves it). Writing `key: undefined` for every absent field would blur that.
 */
export function defined<T extends Record<string, unknown>>(
  object: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
