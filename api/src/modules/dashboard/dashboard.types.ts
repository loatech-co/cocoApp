/** The dashboard as the service hands it out: the domain, in English. */
import type { BREAKDOWN_LEVEL, English, GRANULARITY, PERIODICITY } from '../../common/vocabulary';
import type { Account } from '../accounts/accounts.service';

/** What the summary is asked for: a range, and the categories or the words to narrow it to. */
export interface DashboardFilters {
  /** `YYYY-MM-DD`; this month when not said. */
  from?: string | undefined;
  to?: string | undefined;
  categoryId?: number | undefined;
  /** Comma-separated ids. */
  categoryIds?: string | undefined;
  q?: string | undefined;
}

export interface PendingPayment {
  categoryId: bigint;
  name: string;
  /** The path to it, to know which part of the house it is about. */
  path: string;
  periodicity: English<typeof PERIODICITY>;
  /** `YYYY-MM-DD`. Already clipped to the short months. */
  dueDate: string;
  /**
   * What it is expected to cost: the average of the months WITH a payment
   * among the three previous ones. `null` if it has never been paid.
   */
  expectedAmount: string | null;
  /**
   * The cost center it hangs from, which is what the list is filtered by.
   *
   * The `id` goes along with the name: the name is what is read and the id is
   * what is compared. Renaming a center from the screen next door has no
   * reason to unselect anything.
   */
  costCenterId: bigint;
  costCenter: string;
  /**
   * What has ALREADY been paid of this this month, cleared.
   *
   * Almost always «0»: a normal pending payment has nothing paid, because on
   * the first movement it leaves the list. It stops being zero for a concept
   * paid in several instalments, which is the case it exists for: there is
   * something paid and something missing AT THE SAME TIME, and the screen has
   * to be able to say «608,350 of 1,200,000 so far».
   */
  paidAmount: string;
  /**
   * Whether this one is covered in pieces.
   *
   * It is not deduced from `paidAmount > 0`: a normal concept with a cleared
   * payment is not in this list, and a marked one on its first trip has zero
   * paid and is in it.
   */
  isMultiPayment: boolean;
}

export interface CategorySpend {
  /** `null` groups what has no category. */
  categoryId: bigint | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: string;
  count: number;
}

export interface TrendPoint {
  /** `2025-03-14` or `2025-03`, by granularity. */
  bucket: string;
  expense: string;
  income: string;
  net: string;
  /** How many movements are behind the point. */
  count: number;
}

export interface Dashboard {
  period: { from: string; to: string; granularity: English<typeof GRANULARITY> };
  accounts: Account[];
  totals: {
    /** Sum of the asset accounts. */
    assets: string;
    /** Sum of what is owed on cards. */
    debts: string;
    /** Assets − debts. */
    netWorth: string;
  };
  /** Of the filtered RANGE, not of the month. */
  range: { income: string; expense: string; net: string; count: number };
  /**
   * Breakdown one level BELOW what is being looked at: with no filter, by cost
   * center; inside a center, by its categories; inside a category, by its
   * concepts. It is what allows drilling down without changing screens.
   */
  byCategory: CategorySpend[];
  /**
   * The range's expense spread by COST CENTER, always at the top level even
   * if `byCategory` went down.
   *
   * They are two different questions: `byCategory` is "what did it go on?"
   * and goes down as far as needed; this is "what kind was it?", and there
   * the top level —fixed against variable— IS the answer.
   */
  expenseByCostCenter: CategorySpend[];
  breakdownLevel: English<typeof BREAKDOWN_LEVEL>;
  /**
   * Whose rows the breakdown shows.
   *
   * `null` at the top level, where the rows are the cost centers and hang
   * from nobody. As soon as it goes down —because something was filtered, or
   * because there was a single row above— it is the category they all belong
   * to, and it is the only thing that explains why that level is shown.
   */
  breakdownParent: { id: bigint; name: string } | null;
  /**
   * What the fixed costs need this month: the sum of ALL recurring concepts
   * due in the month, paid or not.
   *
   * Of the current month, like `pending`, and not of the filtered range: it
   * is a question about what is coming, not about what is being reviewed.
   */
  requiredBudget: string;
  /** What is expected to be paid this month and does not show up yet. */
  pending: PendingPayment[];
  trend: TrendPoint[];
}
