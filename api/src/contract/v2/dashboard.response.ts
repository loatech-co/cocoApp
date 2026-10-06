import { ApiProperty } from '@nestjs/swagger';

import { Account } from './accounts.response';
import { PERIODICITIES } from './categories.response';

export const GRANULARITIES = ['day', 'month'] as const;
export const BREAKDOWN_LEVELS = ['cost_center', 'category', 'concept'] as const;

export class DashboardPeriod {
  from!: string;
  to!: string;
  @ApiProperty({ enum: GRANULARITIES })
  granularity!: (typeof GRANULARITIES)[number];
}

export class DashboardTotals {
  assets!: string;
  debts!: string;
  netWorth!: string;
}

export class DashboardRange {
  income!: string;
  expense!: string;
  net!: string;
  count!: number;
}

export class CategorySpend {
  /** `null` groups what has no category. */
  categoryId!: number | null;
  name!: string;
  color!: string | null;
  icon!: string | null;
  total!: string;
  count!: number;
}

export class PendingPayment {
  categoryId!: number;
  name!: string;
  path!: string;
  @ApiProperty({ enum: PERIODICITIES })
  periodicity!: (typeof PERIODICITIES)[number];
  dueDate!: string;
  expectedAmount!: string | null;
  costCenterId!: number;
  costCenter!: string;
  paidAmount!: string;
  isMultiPayment!: boolean;
}

export class TrendPoint {
  bucket!: string;
  expense!: string;
  income!: string;
  net!: string;
  count!: number;
}

export class BreakdownParent {
  id!: number;
  name!: string;
}

export class Dashboard {
  period!: DashboardPeriod;
  accounts!: Account[];
  totals!: DashboardTotals;
  range!: DashboardRange;
  byCategory!: CategorySpend[];
  expenseByCostCenter!: CategorySpend[];
  @ApiProperty({ enum: BREAKDOWN_LEVELS })
  breakdownLevel!: (typeof BREAKDOWN_LEVELS)[number];
  breakdownParent!: BreakdownParent | null;
  requiredBudget!: string;
  pending!: PendingPayment[];
  trend!: TrendPoint[];
}
