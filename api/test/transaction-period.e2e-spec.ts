import request from 'supertest';

import { makeAccount, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * `period` is the month a movement belongs to, always its first day. A PATCH
 * that moves the date drags the month with it, an explicit month survives it,
 * and a period sent as any day of the month is stored as day 1 (R3-A).
 */
describe('Transaction period (e2e)', () => {
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

  const base = '/api/v2/transactions';

  async function periodOf(id: bigint): Promise<string> {
    const row = await env.prisma.transaction.findUniqueOrThrow({ where: { id } });
    return row.period.toISOString().slice(0, 10);
  }

  it('moves the month along with the date when the period was not explicit', async () => {
    const tx = await makeTransaction(env.prisma, user.id, { date: '2026-03-05' });

    const patched = await http
      .patch(`${base}/${tx.id}`)
      .set('Authorization', auth)
      .send({ date: '2026-04-05' })
      .expect(200);

    expect(patched.body.data.period).toBe('2026-04-01');
    expect(await periodOf(tx.id)).toBe('2026-04-01');

    const april = await http
      .get(`${base}?from=2026-04-01&to=2026-04-30`)
      .set('Authorization', auth)
      .expect(200);
    expect(april.body.data.map((t: { id: number }) => t.id)).toEqual([Number(tx.id)]);
  });

  it('keeps an explicit month when only the date changes', async () => {
    const bill = await makeTransaction(env.prisma, user.id, {
      date: '2026-04-06',
      period: '2026-03-01',
    });

    await http
      .patch(`${base}/${bill.id}`)
      .set('Authorization', auth)
      .send({ date: '2026-04-09' })
      .expect(200);

    expect(await periodOf(bill.id)).toBe('2026-03-01');
  });

  it('changes the month on its own and normalizes it to day 1', async () => {
    const tx = await makeTransaction(env.prisma, user.id, { date: '2026-03-05' });

    const patched = await http
      .patch(`${base}/${tx.id}`)
      .set('Authorization', auth)
      .send({ period: '2026-02-15' })
      .expect(200);

    expect(patched.body.data).toMatchObject({ date: '2026-03-05', period: '2026-02-01' });
    expect(await periodOf(tx.id)).toBe('2026-02-01');
  });

  it('stores a mid-month period of a new movement as the first day', async () => {
    const created = await http
      .post(base)
      .set('Authorization', auth)
      .send({ date: '2026-03-05', amount: '1000', period: '2026-02-20' })
      .expect(201);

    expect(created.body.data.period).toBe('2026-02-01');
  });

  it('gives both legs of a transfer the normalized month, on creation and on edit', async () => {
    const [from, to] = [
      await makeAccount(env.prisma, user.id),
      await makeAccount(env.prisma, user.id, { name: 'Banco', type: 'bank' }),
    ];

    const transfer = await http
      .post(`${base}/transfer`)
      .set('Authorization', auth)
      .send({
        fromAccountId: Number(from.id),
        toAccountId: Number(to.id),
        date: '2026-03-05',
        amount: '1000',
        period: '2026-02-20',
      })
      .expect(201);
    const legs = transfer.body.data.legs as { id: number; period: string }[];
    expect(legs.map((leg) => leg.period)).toEqual(['2026-02-01', '2026-02-01']);

    await http
      .patch(`${base}/${legs[0]?.id}`)
      .set('Authorization', auth)
      .send({ period: '2026-05-31' })
      .expect(200);

    for (const leg of legs) expect(await periodOf(BigInt(leg.id))).toBe('2026-05-01');
  });
});
