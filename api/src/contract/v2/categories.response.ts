import { ApiProperty } from '@nestjs/swagger';

export const CATEGORY_KINDS = ['expense', 'income', 'transfer'] as const;
export const PERIODICITIES = ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'] as const;

/** One category, whatever its level: cost center, category or concept. */
export class Category {
  id!: number;
  /** `null` for a cost center, the top of the tree. */
  parentId!: number | null;
  name!: string;
  @ApiProperty({ enum: CATEGORY_KINDS })
  kind!: (typeof CATEGORY_KINDS)[number];
  color!: string | null;
  icon!: string | null;
  sortOrder!: number;
  isArchived!: boolean;
  /** Whether the concept is paid every so often. */
  isRecurring!: boolean;
  /** Whether the cost center refuses reclassification from the transactions table. */
  isStatic!: boolean;
  @ApiProperty({ enum: PERIODICITIES, nullable: true })
  periodicity!: (typeof PERIODICITIES)[number] | null;
  /** Day of the month it is due. */
  paymentDay!: number | null;
  /** Reference month of the cycle, 1–12. Only when the periodicity is not monthly. */
  paymentMonth!: number | null;
  /** Expected cost each time, as a decimal string. */
  budget!: string | null;
  /** Whether the transaction is created on its own on the due day. */
  isAutoPaid!: boolean;
  /** Whether it is paid in several parts rather than settled at once. */
  isMultiPayment!: boolean;
  /** Words looked for in a receipt to recognise this concept. */
  keywords!: string[];
}

/** A category in the tree, with everything that hangs from it. */
export class CategoryNode extends Category {
  children!: CategoryNode[];
}

export class CategoryMerge {
  /** Transactions moved to the target. */
  moved!: number;
  target!: Category;
}

export class CategoryUsage {
  /** Transactions in the whole subtree, not only in this row. */
  transactions!: number;
  subcategories!: number;
}

export class CategorySeed {
  /** Categories the seed created; 0 when the user already had a tree. */
  created!: number;
}
