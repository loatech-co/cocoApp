import type { Prisma } from '../../generated/prisma/client';

/**
 * Lista blanca de campos ordenables.
 *
 * El cliente NUNCA elige un nombre de columna libremente, ni siquiera para
 * ordenar: pasar entrada del usuario a `orderBy` abre la puerta a filtrar la
 * forma del esquema y, según el motor, a algo peor. Lo que no está en esta
 * tabla no existe.
 */
const SORTABLE_FIELDS = {
  date: 'date',
  amount: 'amount',
  created_at: 'createdAt',
  merchant: 'merchant',
} as const satisfies Record<string, keyof Prisma.TransactionOrderByWithRelationInput>;

type SortableField = keyof typeof SORTABLE_FIELDS;

/** Orden por defecto: lo más reciente primero, que es como se lee un extracto. */
const DEFAULT_ORDER: Prisma.TransactionOrderByWithRelationInput[] = [
  { date: 'desc' },
  { id: 'desc' },
];

/**
 * Traduce `?sort=-date` al `orderBy` de Prisma.
 *
 * El prefijo `-` indica descendente. Un campo desconocido no revienta la
 * petición: se ignora y se usa el orden por defecto — un parámetro de
 * presentación mal escrito no debería impedirle a alguien ver sus movimientos.
 *
 * Siempre desempata por `id` para que la paginación sea estable: sin ese
 * desempate, dos filas con la misma fecha pueden alternar de página entre
 * consultas y el usuario vería un movimiento repetido o se le perdería otro.
 */
export function parseOrder(sort?: string): Prisma.TransactionOrderByWithRelationInput[] {
  if (!sort) return DEFAULT_ORDER;

  const isDescending = sort.startsWith('-');
  const fieldName = isDescending ? sort.slice(1) : sort;

  if (!(fieldName in SORTABLE_FIELDS)) return DEFAULT_ORDER;

  const field = SORTABLE_FIELDS[fieldName as SortableField];
  const direction: Prisma.SortOrder = isDescending ? 'desc' : 'asc';

  return [{ [field]: direction }, { id: direction }];
}

export interface Pagination {
  page: number;
  perPage: number;
  skip: number;
  take: number;
}

const DEFAULT_PER_PAGE = 50;
export const MAX_PER_PAGE = 200;

export function parsePagination(page?: number, perPage?: number): Pagination {
  const safePage = Math.max(1, page ?? 1);
  const safePerPage = Math.min(MAX_PER_PAGE, Math.max(1, perPage ?? DEFAULT_PER_PAGE));

  return {
    page: safePage,
    perPage: safePerPage,
    skip: (safePage - 1) * safePerPage,
    take: safePerPage,
  };
}
