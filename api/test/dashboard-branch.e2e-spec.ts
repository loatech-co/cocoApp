import request from 'supertest';

import { makeConcept, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

interface Spend {
  total: string;
  count: number;
}

interface Summary {
  range: { expense: string; count: number };
  trend: { expense: string; count: number }[];
  byCategory: Spend[];
  expenseByCostCenter: Spend[];
}

/**
 * Filtering the dashboard by a branch used to bring every row that touched it
 * through ONE split, whole: the flow and the trend added the full amount and
 * the breakdown pushed the other splits onto their own centers, so the three
 * figures on the same screen disagreed (R4-A, A1).
 */
describe('Dashboard filtered by a branch with mixed splits (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let user: TestUser;
  let auth: string;

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
    user = await env.createUser();
    auth = env.as(user);
  });

  async function summary(filter = ''): Promise<Summary> {
    const r = await http
      .get(`/api/v2/dashboard?from=2026-09-01&to=2026-09-30${filter}`)
      .set('Authorization', auth)
      .expect(200);
    return r.body.data;
  }

  function sum(rows: readonly Spend[]): number {
    return rows.reduce((total, row) => total + Number(row.total), 0);
  }

  it('reads the same figure in the flow, the trend and the breakdown', async () => {
    const home = await makeConcept(env.prisma, user.id);
    const leisure = await makeConcept(env.prisma, user.id, {
      center: { name: 'Ocio' },
      category: { name: 'Salidas' },
      concept: { name: 'Cine' },
    });

    // One purchase split across both centers, and a plain one in the branch.
    await makeTransaction(env.prisma, user.id, {
      type: 'expense',
      amount: '300',
      splits: {
        create: [
          { categoryId: home.concept.id, amount: '100' },
          { categoryId: leisure.concept.id, amount: '200' },
        ],
      },
    });
    await makeTransaction(env.prisma, user.id, {
      type: 'expense',
      amount: '50',
      categoryId: home.concept.id,
    });
    // A split row that names the branch only in its header pays nothing to it.
    await makeTransaction(env.prisma, user.id, {
      type: 'expense',
      amount: '70',
      categoryId: home.concept.id,
      splits: { create: [{ categoryId: leisure.concept.id, amount: '70' }] },
    });

    const whole = await summary();
    expect(Number(whole.range.expense)).toBe(420);
    expect(whole.range.count).toBe(3);

    const branch = await summary(`&categoryId=${home.center.id}`);
    expect(Number(branch.range.expense)).toBe(150);
    expect(branch.range.count).toBe(2);
    expect(branch.trend.reduce((total, p) => total + Number(p.expense), 0)).toBe(150);
    expect(branch.trend.reduce((total, p) => total + p.count, 0)).toBe(2);
    expect(sum(branch.byCategory)).toBe(150);
    expect(sum(branch.expenseByCostCenter)).toBe(150);
    expect(branch.expenseByCostCenter).toHaveLength(1);
  });

  it('reads the same figure in the list filtered by the branch', async () => {
    const home = await makeConcept(env.prisma, user.id);
    const leisure = await makeConcept(env.prisma, user.id, {
      center: { name: 'Ocio' },
      category: { name: 'Salidas' },
      concept: { name: 'Cine' },
    });
    await makeTransaction(env.prisma, user.id, {
      type: 'expense',
      amount: '300',
      splits: {
        create: [
          { categoryId: home.concept.id, amount: '100' },
          { categoryId: leisure.concept.id, amount: '200' },
        ],
      },
    });
    await makeTransaction(env.prisma, user.id, {
      type: 'expense',
      amount: '50',
      categoryId: home.concept.id,
    });
    await makeTransaction(env.prisma, user.id, {
      type: 'expense',
      amount: '70',
      categoryId: home.concept.id,
      splits: { create: [{ categoryId: leisure.concept.id, amount: '70' }] },
    });

    // The list used to match the header alone: the split purchase was missing
    // and its footer disagreed with the dashboard flow (R5-A, A2).
    const list = await http
      .get(`/api/v2/transactions?from=2026-09-01&to=2026-09-30&categoryId=${home.center.id}`)
      .set('Authorization', auth)
      .expect(200);
    const dashboard = await summary(`&categoryId=${home.center.id}`);

    expect(list.body.data).toHaveLength(3);
    expect(Number(list.body.meta.sumExpense)).toBe(150);
    expect(Number(list.body.meta.sumExpense)).toBe(Number(dashboard.range.expense));

    // Searching the concept's name also finds the row that only names it in a split.
    const byName = await http
      .get('/api/v2/transactions?from=2026-09-01&to=2026-09-30&q=cine')
      .set('Authorization', auth)
      .expect(200);
    expect(byName.body.data).toHaveLength(2);
  });
});
