import type { Prisma } from '@prisma/client';

/**
 * Lista blanca de campos ordenables.
 *
 * El cliente NUNCA elige un nombre de columna libremente, ni siquiera para
 * ordenar: pasar entrada del usuario a `orderBy` abre la puerta a filtrar la
 * forma del esquema y, según el motor, a algo peor. Lo que no está en esta
 * tabla no existe.
 */
const CAMPOS_PERMITIDOS = {
  date: 'date',
  amount: 'amount',
  created_at: 'createdAt',
  merchant: 'merchant',
} as const satisfies Record<string, keyof Prisma.TransactionOrderByWithRelationInput>;

export type CampoOrdenable = keyof typeof CAMPOS_PERMITIDOS;

/** Orden por defecto: lo más reciente primero, que es como se lee un extracto. */
const ORDEN_POR_DEFECTO: Prisma.TransactionOrderByWithRelationInput[] = [
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
export function parseOrden(sort?: string): Prisma.TransactionOrderByWithRelationInput[] {
  if (!sort) return ORDEN_POR_DEFECTO;

  const descendente = sort.startsWith('-');
  const nombre = descendente ? sort.slice(1) : sort;

  if (!(nombre in CAMPOS_PERMITIDOS)) return ORDEN_POR_DEFECTO;

  const campo = CAMPOS_PERMITIDOS[nombre as CampoOrdenable];
  const direccion: Prisma.SortOrder = descendente ? 'desc' : 'asc';

  return [{ [campo]: direccion }, { id: direccion }];
}

export interface Paginacion {
  page: number;
  perPage: number;
  skip: number;
  take: number;
}

export const PER_PAGE_POR_DEFECTO = 50;
export const PER_PAGE_MAXIMO = 200;

export function parsePaginacion(page?: number, perPage?: number): Paginacion {
  const paginaSegura = Math.max(1, page ?? 1);
  const porPaginaSegura = Math.min(PER_PAGE_MAXIMO, Math.max(1, perPage ?? PER_PAGE_POR_DEFECTO));

  return {
    page: paginaSegura,
    perPage: porPaginaSegura,
    skip: (paginaSegura - 1) * porPaginaSegura,
    take: porPaginaSegura,
  };
}
