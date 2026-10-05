import { ApiProperty } from '@nestjs/swagger';

import { AccountResponse } from './accounts.response';

export class DashboardPeriodResponse {
  from!: string;
  to!: string;
  @ApiProperty({ enum: ['dia', 'mes'] })
  granularity!: 'dia' | 'mes';
}

export class DashboardTotalsResponse {
  assets!: string;
  debts!: string;
  net_worth!: string;
}

export class DashboardRangeResponse {
  income!: string;
  expense!: string;
  net!: string;
  count!: number;
}

export class CategorySpendResponse {
  /** `null` groups what has no category. */
  category_id!: number | null;
  name!: string;
  color!: string | null;
  icon!: string | null;
  total!: string;
  count!: number;
}

export class PendingPaymentResponse {
  category_id!: number;
  name!: string;
  path!: string;
  periodicidad!: string;
  due_date!: string;
  expected_amount!: string | null;
  centro_id!: number;
  centro!: string;
  paid_amount!: string;
  varios_pagos!: boolean;
}

export class TrendPointResponse {
  bucket!: string;
  expense!: string;
  income!: string;
  net!: string;
  count!: number;
}

export class BreakdownParentResponse {
  id!: number;
  name!: string;
}

export class DashboardResponse {
  period!: DashboardPeriodResponse;
  accounts!: AccountResponse[];
  totals!: DashboardTotalsResponse;
  range!: DashboardRangeResponse;
  by_category!: CategorySpendResponse[];
  expense_by_center!: CategorySpendResponse[];
  @ApiProperty({ enum: ['centro de costos', 'categoría', 'concepto'] })
  breakdown_level!: 'centro de costos' | 'categoría' | 'concepto';
  breakdown_parent!: BreakdownParentResponse | null;
  required_budget!: string;
  pending!: PendingPaymentResponse[];
  trend!: TrendPointResponse[];
}
