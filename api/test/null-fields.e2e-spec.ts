import request from 'supertest';

import { makeAccount, makeConcept, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * A field that may be left out is not a field that may be `null`: sent as
 * `null`, a date became 1970-01-01 and an amount a 500 (R3-A). Only the fields
 * that mean something by `null` (clearing a category, a budget) accept it.
 */
describe('Null in optional fields (e2e)', () => {
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

  async function rejects(path: string, body: object, field: string): Promise<void> {
    const response = await http.patch(path).set('Authorization', auth).send(body).expect(400);
    const named = (response.body.errors as { field: string }[]).map((e) => e.field);
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(new Set([field]));
  }

  it('rejects null in the non-nullable fields of a transaction', async () => {
    const tx = await makeTransaction(env.prisma, user.id);
    const path = `/api/v2/transactions/${tx.id}`;

    await rejects(path, { date: null }, 'date');
    await rejects(path, { amount: null }, 'amount');
    await rejects(path, { accountId: null }, 'accountId');
    await rejects(path, { period: null }, 'period');
    await rejects(path, { description: null }, 'description');

    const untouched = await env.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(untouched.date.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  it('rejects null in the money fields and the account of a new movement', async () => {
    await http
      .post('/api/v2/transactions')
      .set('Authorization', auth)
      .send({ date: '2026-09-10', amount: '1000', accountId: null })
      .expect(400);
  });

  it('still clears a category, a capture time and a budget with null', async () => {
    const { concept } = await makeConcept(env.prisma, user.id, { concept: { budget: '100' } });
    const tx = await makeTransaction(env.prisma, user.id, {
      categoryId: concept.id,
      capturedAt: new Date('2026-09-10T10:00:00Z'),
    });

    const cleared = await http
      .patch(`/api/v2/transactions/${tx.id}`)
      .set('Authorization', auth)
      .send({ categoryId: null, capturedAt: null, rawText: null })
      .expect(200);
    expect(cleared.body.data.categoryId).toBeNull();

    const noBudget = await http
      .patch(`/api/v2/categories/${concept.id}`)
      .set('Authorization', auth)
      .send({ budget: null })
      .expect(200);
    expect(noBudget.body.data.budget).toBeNull();
  });

  it('rejects null in the money fields of an account', async () => {
    const account = await makeAccount(env.prisma, user.id, { type: 'credit' });
    const path = `/api/v2/accounts/${account.id}`;

    await rejects(path, { creditLimit: null }, 'creditLimit');
    await rejects(path, { openingBalance: null }, 'openingBalance');
    await rejects(path, { name: null }, 'name');
  });
});
