import request from 'supertest';

import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Phase 6.4: every movement carries its currency, COP by default, and the API
 * returns it so the client formats with the row's currency instead of a
 * hard-coded one.
 */
describe('Transaction currency (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let ana: TestUser;
  let asAna: string;

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
    ana = await env.createUser({ displayName: 'Ana' });
    asAna = env.as(ana);
  });

  it('a new movement is COP and says so', async () => {
    const created = await http
      .post('/api/v2/transactions')
      .set('Authorization', asAna)
      .send({ date: '2026-10-01', amount: '45900', type: 'expense' })
      .expect(201);

    expect(created.body.data.currency).toBe('COP');

    const row = await env.prisma.transaction.findFirstOrThrow({ where: { userId: ana.id } });
    expect(row.currency).toBe('COP');
  });

  it('the list returns the currency of each row', async () => {
    await env.prisma.transaction.create({
      data: {
        userId: ana.id,
        date: new Date('2026-10-02'),
        period: new Date('2026-10-01'),
        amount: '10',
        currency: 'USD',
      },
    });

    const list = await http.get('/api/v2/transactions').set('Authorization', asAna).expect(200);

    expect(list.body.data.map((t: { currency: string }) => t.currency)).toEqual(['USD']);
  });
});
