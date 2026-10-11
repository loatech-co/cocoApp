import request from 'supertest';

import { makeAccount, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * What the body validation has to refuse at the door (R4-A): a transfer leg
 * written alone (A2), a day the calendar does not have or a date with a time
 * (A3), and `null` where only absence is allowed (A4).
 */
describe('Request validation of transactions and captures (e2e)', () => {
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

  it('refuses a loose transfer leg on create and on edit', async () => {
    const account = await makeAccount(env.prisma, user.id);
    const created = await http
      .post('/api/v2/transactions')
      .set('Authorization', auth)
      .send({ date: '2026-09-10', amount: '1000', type: 'transfer', accountId: Number(account.id) })
      .expect(422);
    expect(created.body.code).toBe('transfer_requires_two_legs');

    const expense = await makeTransaction(env.prisma, user.id, { type: 'expense' });
    const edited = await http
      .patch(`/api/v2/transactions/${expense.id}`)
      .set('Authorization', auth)
      .send({ type: 'transfer' })
      .expect(422);
    expect(edited.body.code).toBe('transfer_requires_two_legs');

    expect(await env.prisma.transaction.count({ where: { type: 'transfer' } })).toBe(0);
  });

  it('still lets a real transfer leg be edited as a transfer', async () => {
    const from = await makeAccount(env.prisma, user.id);
    const to = await makeAccount(env.prisma, user.id, { name: 'Ahorro', type: 'savings' });
    const transfer = await http
      .post('/api/v2/transactions/transfer')
      .set('Authorization', auth)
      .send({
        fromAccountId: Number(from.id),
        toAccountId: Number(to.id),
        date: '2026-09-10',
        amount: '10',
      })
      .expect(201);
    const leg = transfer.body.data.legs[0].id;

    await http
      .patch(`/api/v2/transactions/${leg}`)
      .set('Authorization', auth)
      .send({ type: 'transfer', description: 'Ahorro' })
      .expect(200);
  });

  it('refuses dates that are not an existing plain day', async () => {
    const tx = await makeTransaction(env.prisma, user.id);
    for (const bad of ['2026-02-30', '2026-02-10T10:00:00Z', '2026-02-10T23:30:00-05:00']) {
      await http
        .post('/api/v2/transactions')
        .set('Authorization', auth)
        .send({ date: bad, amount: '1' })
        .expect(400);
      await http
        .patch(`/api/v2/transactions/${tx.id}`)
        .set('Authorization', auth)
        .send({ period: bad })
        .expect(400);
    }
    await http
      .post('/api/v2/transactions')
      .set('Authorization', auth)
      .send({ date: '2024-02-29', amount: '1' })
      .expect(201);
  });

  it('refuses null as the capture time', async () => {
    const response = await http
      .post('/api/v2/transactions/capture')
      .set('Authorization', auth)
      .send({ text: 'Compra', source: 'sms', externalRef: 'sms-null', capturedAt: null })
      .expect(400);
    const named = (response.body.errors as { field: string }[]).map((e) => e.field);
    expect(named).toEqual(['capturedAt']);
  });
});
