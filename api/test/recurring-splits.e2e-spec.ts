import request from 'supertest';

import { makeConcept, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';
import { AutoChargeTask } from '../src/modules/dashboard/auto-charge.task';

/**
 * A recurring concept paid inside a split is paid: it leaves the pending list,
 * its history feeds the estimate and the auto-charge does not write it again.
 * An income with the concept's category is not a payment of it (R3-A).
 */
describe('Recurring concepts paid through splits (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let user: TestUser;
  let auth: string;

  /** The months as the dashboard counts them: today in Bogotá, and the two before. */
  const NOW = new Date();
  const [MONTH, LAST, BEFORE_LAST] = [0, 1, 2].map((back) =>
    new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - back, 1, 12) - 5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 7),
  );

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

  async function water(extra: object = {}): Promise<bigint> {
    const { concept } = await makeConcept(env.prisma, user.id, {
      concept: {
        name: 'Agua',
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 10,
        ...extra,
      },
    });
    return concept.id;
  }

  /** A purchase with the concept as one of its parts, plus an unclassified rest. */
  async function splitPayment(categoryId: bigint, date: string, part: string): Promise<void> {
    await env.prisma.transaction.create({
      data: {
        userId: user.id,
        date: new Date(date),
        period: new Date(`${date.slice(0, 7)}-01`),
        amount: '500',
        type: 'expense',
        status: 'cleared',
        splits: { create: [{ categoryId, amount: part }, { amount: '400' }] },
      },
    });
  }

  async function dashboard(): Promise<{
    pending: { name: string; expectedAmount: string | null; paidAmount: string }[];
  }> {
    const r = await http
      .get(`/api/v2/dashboard?from=${MONTH}-01&to=${MONTH}-31`)
      .set('Authorization', auth)
      .expect(200);
    return r.body.data;
  }

  it('a split payment this month settles the concept', async () => {
    const concept = await water();
    await splitPayment(concept, `${MONTH}-03`, '100');

    expect((await dashboard()).pending).toEqual([]);
  });

  it('split payments of past months feed the estimate', async () => {
    const concept = await water();
    await splitPayment(concept, `${BEFORE_LAST}-03`, '100');
    await splitPayment(concept, `${LAST}-03`, '80');

    const { pending } = await dashboard();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ name: 'Agua', expectedAmount: '90.00' });
  });

  it('an income in the concept is not a payment of it', async () => {
    const concept = await water();
    await makeTransaction(env.prisma, user.id, {
      date: `${MONTH}-03`,
      categoryId: concept,
      type: 'income',
    });

    const { pending } = await dashboard();
    expect(pending.map((p) => p.name)).toEqual(['Agua']);
  });

  it('the auto-charge does not write on top of a split payment', async () => {
    const concept = await water({ paymentDay: 1, budget: '100', isAutoPaid: true });
    await splitPayment(concept, `${MONTH}-03`, '100');

    expect(await env.app.get(AutoChargeTask).runOnce(NOW)).toBe(0);
  });
});
