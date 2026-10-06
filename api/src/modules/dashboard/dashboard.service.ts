import { Injectable } from '@nestjs/common';

import { computeFlow, type AggregableMovement } from './dashboard.aggregate';
import type { DashboardQueryDto } from './dashboard.dto';
import {
  toIsoDate,
  treeOf,
  breakdown,
  pendingThisMonth,
  defaultRange,
  liveRecurring,
  trend,
  totalsOf,
  type Tree,
} from './dashboard.summary';
import type { Dashboard, PendingPayment } from './dashboard.types';
import { historyWindow } from './pending';
import { categoryIds, branchesOf } from '../../common/categories/categories.tree';
import { ZERO, serialize, toMoney, type Money } from '../../common/money/money';
import { Database } from '../../prisma/database';
import { AccountsService } from '../accounts/accounts.service';
import { CategoryLookupService, type SummaryCategory } from '../categories/category-lookup.service';
import { LedgerService, type SummaryMovement } from '../transactions/ledger.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly categories: CategoryLookupService,
    private readonly ledger: LedgerService,
    private readonly accounts: AccountsService,
    private readonly db: Database,
  ) {}

  /**
   * One unit of work for the whole summary: its six reads share one
   * transaction instead of opening one each. Measured in ADR 0019: the
   * per-unit BEGIN/set_config/COMMIT, not the policies, is what RLS costs,
   * and this screen is the one that pays it six times.
   */
  summary(userId: bigint, query: DashboardQueryDto): Promise<Dashboard> {
    return this.db.forUser(userId, () => this.readSummary(userId, query));
  }

  private async readSummary(userId: bigint, query: DashboardQueryDto): Promise<Dashboard> {
    const { start, end } = defaultRange(query.from, query.to);

    // A GET only reads. Auto-paid concepts are charged by AutoChargeTask, once
    // a day and at start-up (phase 6.7), not on the way in here.

    const categories = await this.categories.findForSummary(userId);
    const tree = treeOf(categories);
    const flat = [...tree.byId.values()];

    // Filtrar por categorías trae TODA su rama: los movimientos cuelgan del
    // concepto, nunca del centro ni dla categoría.
    const requested = [
      ...(query.category_id !== undefined ? [BigInt(query.category_id)] : []),
      ...categoryIds(query.category_ids),
    ];

    const [accounts, movements] = await Promise.all([
      this.accounts.list(userId, false),
      this.ledger.findForSummary(userId, {
        from: start,
        to: end,
        branch: requested.length > 0 ? branchesOf(flat, requested) : null,
        q: query.q,
        byName: query.q ? branchesByName(categories, query.q) : [],
      }),
    ]);

    const flow = computeFlow(movements.map(toAggregable));

    const parts = breakdown(movements, tree, requested.length === 1 ? requested[0] : undefined);
    const parentData =
      parts.parent === null ? undefined : tree.dataById.get(parts.parent.toString());
    const { granularity, points } = trend(movements, start, end);
    const { pending, budget } = await this.monthPending(userId, categories, tree);

    return {
      period: { from: toIsoDate(start), to: toIsoDate(end), granularity },
      accounts,
      totals: totalsOf(accounts),
      range: {
        income: serialize(flow.income),
        expense: serialize(flow.expense),
        net: serialize(flow.net),
        count: movements.length,
      },
      byCategory: parts.byCategory,
      expenseByCostCenter: parts.byCostCenter,
      breakdownLevel: breakdownLevelOf(parts.shownLevel),
      breakdownParent:
        parts.parent !== null && parentData ? { id: parts.parent, name: parentData.name } : null,
      requiredBudget: serialize(toMoney(budget)),
      pending,
      trend: points,
    };
  }

  /**
   * Lo que falta pagar este mes, y lo que hace falta para todo el mes.
   *
   * Del mes EN CURSO, no del rango que se esté mirando: la pregunta "¿qué me
   * falta pagar?" es siempre sobre hoy, aunque uno esté revisando 2024.
   */
  private async monthPending(
    userId: bigint,
    categories: readonly SummaryCategory[],
    tree: Tree,
  ): Promise<{ pending: PendingPayment[]; budget: Money }> {
    const currentMonth = `${new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 7)}-01`;
    const recurring = liveRecurring(categories);
    if (recurring.length === 0) return { pending: [], budget: ZERO };

    const ids = recurring.map((c) => c.id);
    // La historia de los recurrentes, mes a mes: de aquí sale lo que se
    // espera que cueste cada uno. Solo lo ANTERIOR a este mes; lo de este
    // mes es un hecho, no una previsión.
    const history = await this.ledger.monthlyHistory(userId, ids, historyWindow(currentMonth));
    /*
      Lo ya pagado ESTE mes, y CONFIRMADO.

      `status: 'cleared'` no es un detalle: un movimiento en `pending` es uno
      que todavía no se sabe si ocurrió —una transferencia programada, un
      débito anunciado—. Sacar el concepto de la lista por un pago que no se
      ha confirmado es prometer que algo está resuelto cuando no lo está, y
      el mes se cierra con un recibo sin pagar que nadie volvió a mirar.

      Un pago pendiente es exactamente eso: algo que está en el presupuesto y
      NO tiene todavía un movimiento confirmado que lo respalde.
    */
    const paidThisMonth = await this.ledger.clearedInMonth(userId, ids, new Date(currentMonth));

    return pendingThisMonth(recurring, { history, paidThisMonth }, currentMonth, tree);
  }
}

/**
 * La búsqueda también entra por la clasificación: "servicios públicos" trae
 * todo lo que cuelga de esa categoría aunque ninguna fila lo diga en su texto.
 */
function branchesByName(categories: readonly SummaryCategory[], q: string): bigint[] {
  const needle = q.toLowerCase();
  const matches = categories.filter((c) => c.name.toLowerCase().includes(needle)).map((c) => c.id);
  const flat = categories.map((c) => ({ id: c.id, parentId: c.parentId }));
  return matches.length > 0 ? branchesOf(flat, matches) : [];
}

function toAggregable(m: SummaryMovement): AggregableMovement {
  return {
    type: m.type,
    amount: toMoney(m.amount),
    categoryId: m.categoryId,
    splits: m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) })),
  };
}

/** The level the breakdown shows, from its depth (1 to 3). */
function breakdownLevelOf(depth: number): Dashboard['breakdownLevel'] {
  // `profundidad` va de 1 a 3: el respaldo nunca se usa.
  const level = (['cost_center', 'category', 'concept'] as const)[depth - 1];
  return level ?? 'concept';
}
