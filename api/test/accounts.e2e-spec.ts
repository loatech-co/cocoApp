import request from 'supertest';

import { makeAccount, makeTransaction } from './factories';
import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

/**
 * The account resource end to end: a credit card with all its fields, the
 * balance it derives from its movements, and the rule that history is
 * archived, never deleted.
 */
describe('Accounts (e2e)', () => {
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

  const base = '/api/v2/accounts';

  it('creates a credit card and derives its balance and available credit', async () => {
    const created = await http
      .post(base)
      .set('Authorization', auth)
      .send({
        name: 'Visa',
        type: 'credit',
        institution: 'Banco',
        last4: '1234',
        creditLimit: '5000000',
        cutoffDay: 15,
        paymentDay: 30,
        openingBalance: '0',
      })
      .expect(201);
    const id = BigInt(created.body.data.id);

    await makeTransaction(env.prisma, user.id, { accountId: id, amount: '1200000' });
    await makeTransaction(env.prisma, user.id, {
      accountId: id,
      amount: '300000',
      status: 'pending',
    });

    const read = await http.get(`${base}/${id}`).set('Authorization', auth).expect(200);
    expect(read.body.data).toMatchObject({
      creditLimit: '5000000.00',
      cutoffDay: 15,
      paymentDay: 30,
      last4: '1234',
    });
    expect(read.body.data.availableCredit).toEqual(expect.any(String));
    expect(read.body.data.balance).not.toBe(read.body.data.balanceProjected);
  });

  it('rejects credit fields on an account that is not a credit card', async () => {
    const response = await http
      .post(base)
      .set('Authorization', auth)
      .send({ name: 'Efectivo', type: 'cash', creditLimit: '100', paymentDay: 5 })
      .expect(400);
    expect(response.body.detail).toMatch(/creditLimit, paymentDay/);

    const cash = await makeAccount(env.prisma, user.id);
    await http
      .patch(`${base}/${cash.id}`)
      .set('Authorization', auth)
      .send({ cutoffDay: 3 })
      .expect(400);
  });

  it('changes every field a PATCH brings', async () => {
    const account = await makeAccount(env.prisma, user.id);

    const patched = await http
      .patch(`${base}/${account.id}`)
      .set('Authorization', auth)
      .send({
        name: 'Tarjeta',
        type: 'credit',
        institution: 'Otro banco',
        last4: '9876',
        creditLimit: '1000000',
        cutoffDay: 1,
        paymentDay: 20,
        openingBalance: '250000',
        isArchived: true,
      })
      .expect(200);

    expect(patched.body.data).toMatchObject({
      name: 'Tarjeta',
      type: 'credit',
      institution: 'Otro banco',
      last4: '9876',
      creditLimit: '1000000.00',
      cutoffDay: 1,
      paymentDay: 20,
      openingBalance: '250000.00',
      isArchived: true,
    });
  });

  it('lists archived accounts only when asked', async () => {
    await makeAccount(env.prisma, user.id, { name: 'Activa' });
    await makeAccount(env.prisma, user.id, { name: 'Vieja', isArchived: true });

    const names = async (query: Record<string, string>) =>
      (await http.get(base).query(query).set('Authorization', auth).expect(200)).body.data
        .map((a: { name: string }) => a.name)
        .sort();

    expect(await names({})).toEqual(['Activa']);
    expect(await names({ includeArchived: 'true' })).toEqual(['Activa', 'Vieja']);
  });

  it('deletes an empty account and refuses one with history', async () => {
    const empty = await makeAccount(env.prisma, user.id);
    const used = await makeAccount(env.prisma, user.id, { name: 'Con historia' });
    await makeTransaction(env.prisma, user.id, { accountId: used.id });

    await http.delete(`${base}/${empty.id}`).set('Authorization', auth).expect(204);
    const conflict = await http.delete(`${base}/${used.id}`).set('Authorization', auth).expect(409);
    expect(conflict.body.detail).toMatch(/Archívala/);
    await http.get(`${base}/${empty.id}`).set('Authorization', auth).expect(404);
  });
});
