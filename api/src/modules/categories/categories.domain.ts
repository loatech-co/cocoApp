import type { WithChildren } from '../../common/categories/categories.tree';
import { PERIODICITY, type English } from '../../common/vocabulary';
import type { Category as CategoryRow, CategoryKind } from '../../generated/prisma/client';

/**
 * A category as the service hands it out, whatever its level (cost center,
 * category, concept): the domain, not a wire format. The API presents it
 * (`presenters/v2`).
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
  /** Whether the concept is paid every so often. */
  isRecurring: boolean;
  /** Whether the cost center cannot be reclassified from the transactions table. */
  isStatic: boolean;
  periodicity: English<typeof PERIODICITY> | null;
  /** Day of the month it is due. */
  paymentDay: number | null;
  /** Reference month of the cycle, 1–12. Only when the periodicity is not monthly. */
  paymentMonth: number | null;
  /**
   * What it is expected to cost each time it comes due. When set, it overrides
   * the average of the previous months. Travels as a string, like all money: a
   * floating-point decimal loses cents.
   */
  budget: string | null;
  /** Whether the transaction is created on its own when the payment day comes. */
  isAutoPaid: boolean;
  /** Whether the concept is covered in pieces and not settled with a single payment. */
  isMultiPayment: boolean;
  /** What is searched for in a receipt to recognize this concept. */
  keywords: string[];
}

/** A category with everything that hangs from it. */
export type CategoryNode = WithChildren<Category>;

/**
 * What a PATCH changes, in the client's words: only the fields that came.
 *
 * The controller builds it from the body, so the service speaks one
 * language. `null` clears a field; an absent key leaves it as it is.
 */
export interface CategoryChanges {
  name?: string;
  kind?: CategoryKind;
  parentId?: bigint | null;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isArchived?: boolean;
  isRecurring?: boolean;
  isStatic?: boolean;
  periodicity?: English<typeof PERIODICITY> | null;
  paymentDay?: number | null;
  paymentMonth?: number | null;
  budget?: number | null;
  isAutoPaid?: boolean;
  isMultiPayment?: boolean;
  keywords?: string[];
}

/** What creating one takes. Without a parent it is a cost center. */
export type NewCategory = Omit<CategoryChanges, 'name' | 'kind' | 'parentId' | 'isArchived'> & {
  name: string;
  kind: CategoryKind;
  parentId?: bigint;
};

/** One row of a reorder: where the category goes among its siblings. */
export interface CategoryPosition {
  id: bigint;
  sortOrder: number;
}

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
    isRecurring: row.isRecurring,
    isStatic: row.isStatic,
    periodicity: row.periodicity,
    paymentDay: row.paymentDay,
    paymentMonth: row.paymentMonth,
    budget: row.budget === null ? null : row.budget.toString(),
    isAutoPaid: row.isAutoPaid,
    isMultiPayment: row.isMultiPayment,
    keywords: row.keywords,
  };
}
