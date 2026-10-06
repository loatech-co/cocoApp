import type { CategoryKind } from '@prisma/client';

import { PERIODICITY, spanish, type Spanish } from '../../common/vocabulary';
import type {
  Category,
  CategoryMerge,
  CategoryNode,
  CategorySeed,
  CategoryTree,
  CategoryUsage,
} from '../../modules/categories/categories.domain';

/** What every v1 category carries, whatever its level, in v1's wire order. */
interface CategoryFieldsV1 {
  name: string;
  kind: CategoryKind;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_archived: boolean;
  recurrente: boolean;
  estatico: boolean;
  periodicidad: Spanish<typeof PERIODICITY, NonNullable<Category['periodicity']>> | null;
  dia_de_pago: number | null;
  mes_de_pago: number | null;
  presupuesto: string | null;
  pago_automatico: boolean;
  varios_pagos: boolean;
  palabras_clave: string[];
}

/** A category as the v1 routes return it: the parent goes LAST, as `parent_id`. */
export type CategoryV1 = { id: bigint } & CategoryFieldsV1 & {
    parent_id: bigint | null;
    children?: CategoryV1[];
  };

/**
 * The destination of `POST /categories/{id}/unificar`. That route always
 * handed out the service's record untouched, so its parent goes second and
 * as `parentId`. v1 keeps it; v2 does not have the quirk.
 */
export type CategoryRecordV1 = { id: bigint; parentId: bigint | null } & CategoryFieldsV1;

function fieldsV1(c: Category): CategoryFieldsV1 {
  return {
    name: c.name,
    kind: c.kind,
    color: c.color,
    icon: c.icon,
    sort_order: c.sortOrder,
    is_archived: c.isArchived,
    recurrente: c.isRecurring,
    estatico: c.isStatic,
    periodicidad: c.periodicity === null ? null : spanish(PERIODICITY, c.periodicity),
    dia_de_pago: c.paymentDay,
    mes_de_pago: c.paymentMonth,
    presupuesto: c.budget,
    pago_automatico: c.isAutoPaid,
    varios_pagos: c.isMultiPayment,
    palabras_clave: c.keywords,
  };
}

export function categoryV1(c: Category): CategoryV1 {
  return { id: c.id, ...fieldsV1(c), parent_id: c.parentId };
}

function categoryNodeV1(node: CategoryNode): CategoryV1 {
  return { ...categoryV1(node), children: node.children.map(categoryNodeV1) };
}

export function categoryTreeV1(tree: CategoryTree): {
  data: CategoryV1[];
  meta: { total: number };
} {
  return { data: tree.tree.map(categoryNodeV1), meta: { total: tree.total } };
}

export function categoryMergeV1(merge: CategoryMerge): {
  movidos: number;
  destino: CategoryRecordV1;
} {
  const { target } = merge;
  return {
    movidos: merge.moved,
    destino: { id: target.id, parentId: target.parentId, ...fieldsV1(target) },
  };
}

export function categoryUsageV1(usage: CategoryUsage): {
  movimientos: number;
  subcategorias: number;
} {
  return { movimientos: usage.transactions, subcategorias: usage.subcategories };
}

export function categorySeedV1(seed: CategorySeed): { creadas: number } {
  return { creadas: seed.created };
}
