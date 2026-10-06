import { accountV1, type AccountV1 } from './accounts.presenter';
import {
  BREAKDOWN_LEVEL,
  GRANULARITY,
  PERIODICITY,
  spanish,
  type Spanish,
} from '../../common/vocabulary';
import type {
  CategorySpend,
  Dashboard,
  PendingPayment,
  TrendPoint,
} from '../../modules/dashboard/dashboard.types';

interface CategorySpendV1 {
  category_id: bigint | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: string;
  count: number;
}

interface PendingPaymentV1 {
  category_id: bigint;
  name: string;
  path: string;
  periodicidad: string;
  due_date: string;
  expected_amount: string | null;
  centro_id: bigint;
  centro: string;
  paid_amount: string;
  varios_pagos: boolean;
}

export interface DashboardV1 {
  period: {
    from: string;
    to: string;
    granularity: Spanish<typeof GRANULARITY, Dashboard['period']['granularity']>;
  };
  accounts: AccountV1[];
  totals: { assets: string; debts: string; net_worth: string };
  range: { income: string; expense: string; net: string; count: number };
  by_category: CategorySpendV1[];
  expense_by_center: CategorySpendV1[];
  breakdown_level: Spanish<typeof BREAKDOWN_LEVEL, Dashboard['breakdownLevel']>;
  breakdown_parent: { id: bigint; name: string } | null;
  required_budget: string;
  pending: PendingPaymentV1[];
  trend: TrendPoint[];
}

function categorySpendV1(c: CategorySpend): CategorySpendV1 {
  return {
    category_id: c.categoryId,
    name: c.name,
    color: c.color,
    icon: c.icon,
    total: c.total,
    count: c.count,
  };
}

function pendingPaymentV1(p: PendingPayment): PendingPaymentV1 {
  return {
    category_id: p.categoryId,
    name: p.name,
    path: p.path,
    periodicidad: spanish(PERIODICITY, p.periodicity),
    due_date: p.dueDate,
    expected_amount: p.expectedAmount,
    centro_id: p.costCenterId,
    centro: p.costCenter,
    paid_amount: p.paidAmount,
    varios_pagos: p.isMultiPayment,
  };
}

function trendPointV1(t: TrendPoint): TrendPoint {
  return { bucket: t.bucket, expense: t.expense, income: t.income, net: t.net, count: t.count };
}

export function dashboardV1(d: Dashboard): DashboardV1 {
  return {
    period: {
      from: d.period.from,
      to: d.period.to,
      granularity: spanish(GRANULARITY, d.period.granularity),
    },
    accounts: d.accounts.map(accountV1),
    totals: { assets: d.totals.assets, debts: d.totals.debts, net_worth: d.totals.netWorth },
    range: {
      income: d.range.income,
      expense: d.range.expense,
      net: d.range.net,
      count: d.range.count,
    },
    by_category: d.byCategory.map(categorySpendV1),
    expense_by_center: d.expenseByCostCenter.map(categorySpendV1),
    breakdown_level: spanish(BREAKDOWN_LEVEL, d.breakdownLevel),
    breakdown_parent: d.breakdownParent,
    required_budget: d.requiredBudget,
    pending: d.pending.map(pendingPaymentV1),
    trend: d.trend.map(trendPointV1),
  };
}
