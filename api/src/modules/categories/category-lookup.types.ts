import type { Periodicity, Prisma } from '../../generated/prisma/client';

/** A category the person picked by hand, with what decides if it can classify. */
export interface ChosenCategory {
  id: bigint;
  name: string;
  isArchived: boolean;
  parent: { id: bigint; parentId: bigint | null } | null;
}

/** A live category as the reading engine indexes it. */
export interface SearchableCategory {
  id: bigint;
  parentId: bigint | null;
  name: string;
  keywords: string[];
}

/** A category as the dashboard summary reads it: tree position and recurrence. */
export interface SummaryCategory {
  id: bigint;
  name: string;
  color: string | null;
  icon: string | null;
  parentId: bigint | null;
  isRecurring: boolean;
  periodicity: Periodicity | null;
  paymentDay: number | null;
  paymentMonth: number | null;
  budget: Prisma.Decimal | null;
  isAutoPaid: boolean;
  isMultiPayment: boolean;
  isArchived: boolean;
}

/** An auto-paid concept, with what decides when and how much to charge. */
export interface AutoPaidConcept {
  id: bigint;
  name: string;
  periodicity: Periodicity | null;
  paymentDay: number | null;
  paymentMonth: number | null;
  budget: Prisma.Decimal | null;
}
