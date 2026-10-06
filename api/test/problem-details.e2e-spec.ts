import request from 'supertest';

import { makeAccount, makeConcept, makeTransaction } from './factories';
import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

/**
 * v2 errors are `application/problem+json` (RFC 9457) with a stable `code`
 * per business rule; v1 keeps `{ error: { code, message, details } }`.
 *
 * Each case is a rule a client has to tell apart from the others without
 * reading the Spanish sentence: the code is what iOS and the web switch on, so
 * a rule that loses its code — or gets another one — is a contract break.
 */
describe('v2 errors: problem+json with a code per rule (e2e)', () => {
  let env: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let user: UsuarioDePrueba;
  let auth: string;
  let conceptId: bigint;
  let categoryId: bigint;

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
    const tree = await makeConcept(env.prisma, user.id);
    conceptId = tree.concept.id;
    categoryId = tree.category.id;
  });

  const post = (path: string, body: object) =>
    http.post(`/api/v2${path}`).set('Authorization', auth).send(body);

  /** The whole problem, checked once per code: the shape is the contract. */
  function expectProblem(response: request.Response, status: number, code: string): void {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.body).toMatchObject({
      type: `https://dev-cocoapp.viteri.me/problems/${code}`,
      title: expect.any(String),
      status,
      detail: expect.any(String),
      code,
    });
  }

  it('splits that do not add up: splits_unbalanced', async () => {
    const response = await post('/transactions', {
      date: '2026-09-10',
      amount: '1000',
      splits: [{ categoryId: Number(conceptId), amount: '400' }],
    });
    expectProblem(response, 422, 'splits_unbalanced');
    expect(response.body).not.toHaveProperty('errors');
  });

  it('a new amount the existing splits no longer add up to: amount_breaks_splits', async () => {
    const created = await post('/transactions', {
      date: '2026-09-10',
      amount: '1000',
      splits: [{ categoryId: Number(conceptId), amount: '1000' }],
    }).expect(201);
    const response = await http
      .patch(`/api/v2/transactions/${String(created.body.data.id)}`)
      .set('Authorization', auth)
      .send({ amount: '2000' });
    expectProblem(response, 422, 'amount_breaks_splits');
  });

  it('a transfer to the same account: transfer_same_account', async () => {
    const account = await makeAccount(env.prisma, user.id);
    const response = await post('/transactions/transfer', {
      fromAccountId: Number(account.id),
      toAccountId: Number(account.id),
      date: '2026-09-10',
      amount: '1000',
    });
    expectProblem(response, 422, 'transfer_same_account');
  });

  it("someone else's category: category_not_owned", async () => {
    const other = await env.crearUsuario();
    const theirs = await makeConcept(env.prisma, other.id);
    const response = await post('/transactions', {
      date: '2026-09-10',
      amount: '1000',
      categoryId: Number(theirs.concept.id),
    });
    expectProblem(response, 422, 'category_not_owned');
  });

  it('«varios pagos» on a concept that does not recur: multi_payment_requires_recurring', async () => {
    const response = await post('/categories', {
      name: 'Mercado',
      kind: 'expense',
      parentId: Number(categoryId),
      isMultiPayment: true,
    });
    expectProblem(response, 422, 'multi_payment_requires_recurring');
  });

  it('deleting a category with transactions, without saying where: reassignment_required', async () => {
    await makeTransaction(env.prisma, user.id, { categoryId: conceptId });
    const response = await http
      .delete(`/api/v2/categories/${String(categoryId)}`)
      .set('Authorization', auth);
    expectProblem(response, 409, 'reassignment_required');
  });

  it('deleting an account with transactions: account_has_transactions', async () => {
    const account = await makeAccount(env.prisma, user.id);
    await makeTransaction(env.prisma, user.id, { accountId: account.id });
    const response = await http
      .delete(`/api/v2/accounts/${String(account.id)}`)
      .set('Authorization', auth);
    expectProblem(response, 409, 'account_has_transactions');
  });

  it('what does not exist, or is not yours: not_found', async () => {
    const response = await http.get('/api/v2/transactions/999999').set('Authorization', auth);
    expectProblem(response, 404, 'not_found');
  });

  it('an id that is not a number: invalid_id', async () => {
    const response = await http.get('/api/v2/transactions/abc').set('Authorization', auth);
    expectProblem(response, 400, 'invalid_id');
  });

  it('invalid input names each field at fault: invalid_fields', async () => {
    const response = await post('/transactions', {
      date: '2026-09-10',
      amount: '1000',
      splits: [{ amount: 'mucho' }],
      category_id: 1,
    });
    expectProblem(response, 400, 'invalid_fields');
    const fields = (response.body.errors as { field: string }[]).map(({ field }) => field);
    expect(fields).toEqual(expect.arrayContaining(['category_id', 'splits.0.amount']));
  });

  it('no session: unauthenticated', async () => {
    const response = await http.get('/api/v2/transactions');
    expectProblem(response, 401, 'unauthenticated');
  });

  it('an unknown route under v2 is a problem too', async () => {
    const response = await http.get('/api/v2/nothing-here').set('Authorization', auth);
    expectProblem(response, 404, 'not_found');
  });

  it('v1 keeps its envelope and its generic code for the same rule', async () => {
    const response = await http
      .post('/api/v1/transactions')
      .set('Authorization', auth)
      .send({
        date: '2026-09-10',
        amount: '1000',
        splits: [{ category_id: Number(conceptId), amount: '400' }],
      })
      .expect(422);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.body).toEqual({
      error: { code: 'unprocessable', message: expect.any(String), details: [] },
    });
  });
});
