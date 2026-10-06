import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';
import { CERO, toMoney, type Money } from '../src/common/money/money';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { esperadoDelMes, ventanaDeLaHistoria } from '../src/modules/dashboard/pendientes';
import { LedgerService, type MonthlyHistory } from '../src/modules/transactions/ledger.service';

/**
 * ADR 0017: the dashboard reads only the slice of each recurring concept's
 * history that the estimate uses. This proves it changes no number: over
 * twenty years of history, the whole dashboard payload built from the bounded
 * read is identical to the one built from the full history, which is what the
 * repository used to load.
 */
describe('Dashboard: bounded recurring history (e2e)', () => {
  let env: EntornoDePruebas;
  let user: UsuarioDePrueba;

  /** Mid-October 2026 in Bogotá: the month being estimated is 2026-10. */
  const NOW = new Date('2026-10-15T15:00:00Z');
  const CURRENT_MONTH = '2026-10-01';

  beforeAll(async () => {
    env = await levantarApp();
    await env.limpiar();
    user = await env.crearUsuario();
    await seedLongHistory(user.id);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await env.cerrar();
  });

  /** What the repository returned before ADR 0017: every month, no lower bound. */
  async function fullHistory(categoryIds: readonly bigint[]): Promise<MonthlyHistory> {
    const rows = await env.prisma.transaction.findMany({
      where: {
        userId: user.id,
        categoryId: { in: [...categoryIds] },
        period: { lt: new Date(CURRENT_MONTH) },
      },
      select: { categoryId: true, amount: true, period: true },
    });
    const history: MonthlyHistory = new Map();
    for (const row of rows) {
      const key = row.categoryId?.toString();
      if (key === undefined) continue;
      const month = row.period.toISOString().slice(0, 7);
      const months = history.get(key) ?? new Map<string, Money>();
      months.set(month, (months.get(month) ?? CERO).plus(toMoney(row.amount)));
      history.set(key, months);
    }
    return history;
  }

  async function recurringIds(): Promise<bigint[]> {
    const concepts = await env.prisma.category.findMany({
      where: { userId: user.id, isRecurring: true },
      select: { id: true },
    });
    return concepts.map((c) => c.id);
  }

  it('estimates every concept exactly as the full history did', async () => {
    const ids = await recurringIds();
    const ledger = env.app.get(LedgerService);
    const bounded = await ledger.monthlyHistory(user.id, ids, ventanaDeLaHistoria(CURRENT_MONTH));
    const full = await fullHistory(ids);

    for (const id of ids) {
      const key = id.toString();
      const expected = esperadoDelMes(null, full.get(key) ?? new Map(), '2026-10');
      const actual = esperadoDelMes(null, bounded.get(key) ?? new Map(), '2026-10');
      expect(actual?.toString() ?? null).toBe(expected?.toString() ?? null);
    }

    // And it is bounded: far fewer months come back than exist.
    const months = (h: MonthlyHistory) => [...h.values()].reduce((n, m) => n + m.size, 0);
    expect(months(full)).toBeGreaterThan(400);
    expect(months(bounded)).toBeLessThan(20);
  });

  it('returns the same dashboard payload as with the full history', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    const dashboard = env.app.get(DashboardService);
    const ledger = env.app.get(LedgerService);

    const bounded = await dashboard.resumen(user.id, {});
    const full = await fullHistory(await recurringIds());
    jest.spyOn(ledger, 'monthlyHistory').mockResolvedValue(full);
    const reference = await dashboard.resumen(user.id, {});

    expect(bounded.pending.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(bounded)).toBe(JSON.stringify(reference));
  });

  async function seedLongHistory(userId: bigint): Promise<void> {
    const center = await env.prisma.category.create({ data: { userId, name: 'Hogar' } });
    const group = await env.prisma.category.create({
      data: { userId, name: 'Servicios', parentId: center.id },
    });
    const concept = (name: string, extra: Record<string, unknown> = {}) =>
      env.prisma.category.create({
        data: {
          userId,
          name,
          parentId: group.id,
          isRecurring: true,
          periodicity: 'monthly',
          paymentDay: 5,
          ...extra,
        },
      });

    // Paid every month for twenty years, twice in some months.
    const power = await concept('Luz');
    // Annual, due in October: nothing in the three months before, so the
    // estimate falls back to last October.
    const insurance = await concept('Seguro', { periodicity: 'annual', paymentMonth: 10 });
    // Last paid in 2014: the fallback month is twelve years back, and it has
    // two payments on different days that must both come back.
    const gym = await concept('Gimnasio');
    // Paid in two of the three window months.
    const water = await concept('Agua');
    // Has a budget: the history must not override it.
    const rent = await concept('Arriendo', { budget: '1000.00' });
    // Never paid: no estimate at all.
    await concept('Nuevo');

    interface Row {
      categoryId: bigint;
      period: string;
      amount: string;
    }
    const rows: Row[] = [];
    for (let i = 1; i <= 240; i += 1) {
      const month = new Date(Date.UTC(2026, 9 - i, 1)).toISOString().slice(0, 10);
      rows.push({ categoryId: power.id, period: month, amount: `${100 + (i % 7)}.25` });
      if (i % 5 === 0) rows.push({ categoryId: power.id, period: month, amount: '12.10' });
      rows.push({ categoryId: rent.id, period: month, amount: `${900 + (i % 3)}.00` });
    }
    for (let year = 2006; year <= 2025; year += 1) {
      rows.push({ categoryId: insurance.id, period: `${year}-10-01`, amount: `${300 + year}.00` });
    }
    for (let i = 0; i < 60; i += 1) {
      const month = new Date(Date.UTC(2010, i, 1)).toISOString().slice(0, 10);
      rows.push({ categoryId: gym.id, period: month, amount: `${40 + (i % 4)}.50` });
    }
    rows.push({ categoryId: gym.id, period: '2014-12-20', amount: '7.30' });
    rows.push({ categoryId: water.id, period: '2026-09-01', amount: '33.00' });
    rows.push({ categoryId: water.id, period: '2026-07-01', amount: '27.00' });
    rows.push({ categoryId: water.id, period: '2019-03-01', amount: '999.00' });

    await env.prisma.transaction.createMany({
      data: rows.map((r) => ({
        userId,
        categoryId: r.categoryId,
        type: 'expense' as const,
        status: 'cleared' as const,
        amount: r.amount,
        date: new Date(r.period),
        period: new Date(r.period),
      })),
    });
  }
});
