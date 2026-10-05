import request from 'supertest';

import { makeAccount, makeConcept, makeTransaction } from './factories';
import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

/**
 * The movement resource end to end: write it whole, change every field, move
 * money between accounts and filter the list. Money is checked as the exact
 * decimal string the API returns, never as a float.
 */
describe('Transactions (e2e)', () => {
  let env: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let user: UsuarioDePrueba;
  let auth: string;

  beforeAll(async () => {
    env = await levantarApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.cerrar();
  });

  beforeEach(async () => {
    await env.limpiar();
    user = await env.crearUsuario();
    auth = env.como(user);
  });

  const base = '/api/v1/transactions';

  it('creates a movement with account, period, splits and tags', async () => {
    const account = await makeAccount(env.prisma, user.id);
    const { concept } = await makeConcept(env.prisma, user.id);

    const created = await http
      .post(base)
      .set('Authorization', auth)
      .send({
        account_id: Number(account.id),
        category_id: Number(concept.id),
        date: '2026-04-02',
        period: '2026-03-01',
        amount: '150000.50',
        description: 'Factura',
        merchant: 'Enel',
        notes: 'marzo',
        status: 'pending',
        tags: ['hogar', 'hogar', 'servicios'],
        splits: [
          { category_id: Number(concept.id), amount: '100000.25', note: 'casa' },
          { amount: '50000.25' },
        ],
      })
      .expect(201);

    const body = created.body.data;
    expect(body).toMatchObject({
      amount: '150000.50',
      period: '2026-03-01',
      account_id: Number(account.id),
      status: 'pending',
    });
    expect(body.splits).toHaveLength(2);
    expect([...body.tags].sort()).toEqual(['hogar', 'servicios']);
  });

  it('rejects splits that do not add up to the amount', async () => {
    const response = await http
      .post(base)
      .set('Authorization', auth)
      .send({ date: '2026-04-02', amount: '100', splits: [{ amount: '60' }, { amount: '30' }] })
      .expect(422);
    expect(response.body.error.message).toMatch(/no coincide con el monto/);
  });

  it('changes every field a PATCH brings and leaves the rest alone', async () => {
    const [from, to] = [
      await makeAccount(env.prisma, user.id),
      await makeAccount(env.prisma, user.id, { name: 'Banco', type: 'bank' }),
    ];
    const { concept } = await makeConcept(env.prisma, user.id);
    const tx = await makeTransaction(env.prisma, user.id, {
      accountId: from.id,
      categoryId: concept.id,
      amount: '1000',
      description: 'antes',
    });

    const patched = await http
      .patch(`${base}/${tx.id}`)
      .set('Authorization', auth)
      .send({
        account_id: Number(to.id),
        date: '2026-09-20',
        amount: '2500',
        type: 'income',
        category_id: null,
        merchant: 'Otro',
        notes: 'nota',
        status: 'pending',
        source: 'ios_manual',
        raw_text: 'texto',
        captured_at: '2026-09-20T10:00:00.000Z',
        por_revisar: true,
        tags: ['nueva'],
        splits: [{ amount: '2500' }],
      })
      .expect(200);

    expect(patched.body.data).toMatchObject({
      account_id: Number(to.id),
      date: '2026-09-20',
      amount: '2500.00',
      type: 'income',
      category_id: null,
      description: 'antes',
      merchant: 'Otro',
      status: 'pending',
      por_revisar: true,
    });

    const cleared = await http
      .patch(`${base}/${tx.id}`)
      .set('Authorization', auth)
      .send({ captured_at: null, category_id: Number(concept.id), description: 'después' })
      .expect(200);
    expect(cleared.body.data).toMatchObject({
      category_id: Number(concept.id),
      description: 'después',
      amount: '2500.00',
    });
  });

  it('moves money between two own accounts as two legs of one group', async () => {
    const from = await makeAccount(env.prisma, user.id);
    const to = await makeAccount(env.prisma, user.id, { name: 'Ahorro', type: 'savings' });

    const response = await http
      .post(`${base}/transfer`)
      .set('Authorization', auth)
      .send({
        from_account_id: Number(from.id),
        to_account_id: Number(to.id),
        date: '2026-09-30',
        period: '2026-09-01',
        amount: '300000',
        description: 'Ahorro del mes',
      })
      .expect(201);

    const { legs, transfer_group_id: group } = response.body.data;
    expect(legs).toHaveLength(2);
    for (const leg of legs) {
      expect(leg).toMatchObject({
        transfer_group_id: group,
        amount: '300000.00',
        type: 'transfer',
      });
    }
  });

  it('refuses a transfer from an account to itself', async () => {
    const account = await makeAccount(env.prisma, user.id);
    await http
      .post(`${base}/transfer`)
      .set('Authorization', auth)
      .send({
        from_account_id: Number(account.id),
        to_account_id: Number(account.id),
        date: '2026-09-30',
        amount: '1',
      })
      .expect(422);
  });

  it('filters the list by period, account, type, status, tag, amount and text', async () => {
    const account = await makeAccount(env.prisma, user.id);
    const { concept } = await makeConcept(env.prisma, user.id, { category: { name: 'Mercado' } });
    const tag = await env.prisma.tag.create({ data: { userId: user.id, name: 'viaje' } });
    const match = await makeTransaction(env.prisma, user.id, {
      accountId: account.id,
      categoryId: concept.id,
      amount: '45000',
      status: 'pending',
      date: '2026-05-10',
    });
    await env.prisma.transactionTag.create({ data: { transactionId: match.id, tagId: tag.id } });
    await makeTransaction(env.prisma, user.id, { amount: '45000', date: '2026-07-10' });

    const list = await http
      .get(base)
      .set('Authorization', auth)
      .query({
        from: '2026-05-01',
        to: '2026-05-31',
        account_id: Number(account.id),
        type: 'expense',
        status: 'pending',
        tag_id: Number(tag.id),
        min_amount: '40000',
        max_amount: '50000',
        q: 'merc',
      })
      .expect(200);

    expect(list.body.data.map((t: { id: number }) => t.id)).toEqual([Number(match.id)]);
  });

  it('reports the first and last period with movements, or none', async () => {
    const empty = await http.get(`${base}/historia`).set('Authorization', auth).expect(200);
    expect(empty.body.data).toEqual({ first: null, last: null });

    await makeTransaction(env.prisma, user.id, { date: '2024-02-10' });
    await makeTransaction(env.prisma, user.id, { date: '2026-08-10' });
    const range = await http.get(`${base}/historia`).set('Authorization', auth).expect(200);
    expect(range.body.data).toEqual({ first: '2024-02-01', last: '2026-08-01' });
  });

  it('answers 409 when the same external reference is written twice', async () => {
    const body = { date: '2026-04-02', amount: '100', external_ref: 'ext-1' };
    await http.post(base).set('Authorization', auth).send(body).expect(201);
    await http.post(base).set('Authorization', auth).send(body).expect(409);
  });
});
