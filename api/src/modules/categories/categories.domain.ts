import type { ConHijos } from '../../common/categories/categories.tree';
import { english, PERIODICITY, type English } from '../../common/vocabulary';
import type { Category as CategoryRow, CategoryKind } from '../../generated/prisma/client';

/**
 * A category as the service hands it out, whatever its level (cost center,
 * category, concept): the domain, not a wire format. Each API version
 * presents it (`presenters/v1`, `presenters/v2`).
 */
export interface Category {
  id: bigint;
  /** `null` for a cost center, the top of the tree. */
  parentId: bigint | null;
  name: string;
  kind: CategoryKind;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isArchived: boolean;
  /** Si el concepto se paga cada cierto tiempo. */
  isRecurring: boolean;
  /** Si el centro de costos no se reclasifica desde la tabla de movimientos. */
  isStatic: boolean;
  periodicity: English<typeof PERIODICITY> | null;
  /** Día del mes en que se debe pagar. */
  paymentDay: number | null;
  /** Mes de referencia del ciclo, 1–12. Solo si la periodicidad no es mensual. */
  paymentMonth: number | null;
  /**
   * Lo que se espera que cueste cada vez que toca. Puesto, manda sobre el
   * promedio de los meses anteriores. Viaja como cadena, igual que todo lo que
   * es dinero: un decimal en coma flotante pierde centavos.
   */
  budget: string | null;
  /** Si el movimiento se crea solo al llegar el día de pago. */
  isAutoPaid: boolean;
  /** Si el concepto se cubre a pedazos y no se salda con un solo pago. */
  isMultiPayment: boolean;
  /** Lo que se busca en un soporte para reconocer este concepto. */
  keywords: string[];
}

/** A category with everything that hangs from it. */
export type CategoryNode = ConHijos<Category>;

/** The tree, by its roots, and how many nodes it holds in all. */
export interface CategoryTree {
  tree: CategoryNode[];
  total: number;
}

export interface CategoryMerge {
  /** Transactions moved to the target. */
  moved: number;
  target: Category;
}

/** What deleting a category would take with it. */
export interface CategoryUsage {
  /** Transactions in the whole subtree, not only in this row. */
  transactions: number;
  subcategories: number;
}

export interface CategorySeed {
  /** Categories the seed created; 0 when the user already had a tree. */
  created: number;
}

export function categoryFromRow(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    kind: row.kind,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isArchived: row.isArchived,
    isRecurring: row.recurrente,
    isStatic: row.estatico,
    periodicity: row.periodicidad === null ? null : english(PERIODICITY, row.periodicidad),
    paymentDay: row.diaDePago,
    paymentMonth: row.mesDePago,
    budget: row.presupuesto === null ? null : row.presupuesto.toString(),
    isAutoPaid: row.pagoAutomatico,
    isMultiPayment: row.variosPagos,
    keywords: row.palabrasClave,
  };
}
