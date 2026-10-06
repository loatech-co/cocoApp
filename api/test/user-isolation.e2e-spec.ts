import request from 'supertest';

import { makeConcept, makeTransaction } from './factories';
import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';
import {
  MARK,
  PNG,
  registeredRoutes,
  seedAna,
  snapshotOf,
  type AnaData,
} from './helpers/isolation';

/**
 * User isolation: Bruno attacks every route with Ana's ids, and her data must
 * come out byte for byte the same and never show up in his answers.
 *
 * It ends with a guard over every registered route: one nobody attacked here
 * (and that is not exempt with a reason) fails the build, and so does a route
 * outside `/api/v2/`.
 */

const COVERED = new Set<string>();
const EXEMPT: Record<string, string> = {
  'POST /api/v2/auth/register': 'public; creates a new account, reads nobody else',
  'POST /api/v2/auth/login': 'public; the credentials select the user',
  'POST /api/v2/auth/refresh': 'public; the refresh token selects the session',
  'POST /api/v2/auth/logout': 'public; revokes only the session of the token it is given',
  'POST /api/v2/auth/change-password':
    'acts on the token subject only (covered in api-v2.e2e-spec); a wrong password here would lock the test user out',
  'GET /api/v2/health': 'no user data',
  'GET /api/v2/ready': 'public probe; runs SELECT 1 and reads no table, so no user data',
};

describe('User isolation (e2e)', () => {
  let env: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let ana: UsuarioDePrueba;
  let bruno: UsuarioDePrueba;
  let asBruno: string;
  let a: AnaData;
  let brunoConceptId: bigint;
  let brunoTransactionId: bigint;

  beforeAll(async () => {
    env = await levantarApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.cerrar();
  });

  beforeEach(async () => {
    await env.limpiar();
    ana = await env.crearUsuario({ displayName: 'Ana' });
    bruno = await env.crearUsuario({ displayName: 'Bruno' });
    asBruno = env.como(bruno);
    a = await seedAna(env, ana.id);

    const { concept } = await makeConcept(env.prisma, bruno.id, {
      center: { name: 'Casa B' },
      category: { name: 'Servicios B' },
      concept: { name: 'Luz B' },
    });
    brunoConceptId = concept.id;
    brunoTransactionId = (
      await makeTransaction(env.prisma, bruno.id, { categoryId: concept.id, date: '2026-09-10' })
    ).id;
  });

  async function untouched(attack: () => Promise<unknown>): Promise<void> {
    const before = await snapshotOf(env, ana.id);
    await attack();
    expect(await snapshotOf(env, ana.id)).toBe(before);
  }

  function covers(routes: string[]): void {
    for (const route of routes) COVERED.add(route);
  }

  function expectNoLeak(body: unknown): void {
    expect(JSON.stringify(body)).not.toContain(MARK);
  }

  covers([
    'GET /api/v2/accounts',
    'GET /api/v2/accounts/:id',
    'PATCH /api/v2/accounts/:id',
    'DELETE /api/v2/accounts/:id',
    'POST /api/v2/accounts',
  ]);
  it('accounts: Bruno cannot read, change or delete Ana’s account, and never lists it', async () => {
    await untouched(async () => {
      const id = String(a.accountId);
      expectNoLeak(
        (await http.get('/api/v2/accounts?includeArchived=true').set('Authorization', asBruno))
          .body,
      );
      await http.get(`/api/v2/accounts/${id}`).set('Authorization', asBruno).expect(404);
      await http
        .patch(`/api/v2/accounts/${id}`)
        .set('Authorization', asBruno)
        .send({ name: 'x', isArchived: true })
        .expect(404);
      await http.delete(`/api/v2/accounts/${id}`).set('Authorization', asBruno).expect(404);
      const created = await http
        .post('/api/v2/accounts')
        .set('Authorization', asBruno)
        .send({ name: 'Mía', type: 'cash' })
        .expect(201);
      expectNoLeak(created.body);
    });
  });

  covers([
    'GET /api/v2/categories',
    'GET /api/v2/categories/:id',
    'POST /api/v2/categories',
    'POST /api/v2/categories/seed',
    'POST /api/v2/categories/reorder',
    'POST /api/v2/categories/:id/merge',
    'PATCH /api/v2/categories/:id',
    'GET /api/v2/categories/:id/usage',
    'DELETE /api/v2/categories/:id',
  ]);
  it('categories: Bruno cannot read, change, delete, merge or hang anything from Ana’s tree', async () => {
    await untouched(async () => {
      const concept = String(a.conceptId);
      expectNoLeak(
        (await http.get('/api/v2/categories').set('Authorization', asBruno).expect(200)).body,
      );
      await http.get(`/api/v2/categories/${concept}`).set('Authorization', asBruno).expect(404);
      await http
        .get(`/api/v2/categories/${concept}/usage`)
        .set('Authorization', asBruno)
        .expect(404);
      await http
        .patch(`/api/v2/categories/${concept}`)
        .set('Authorization', asBruno)
        .send({ name: 'x', periodicity: 'annual' })
        .expect(404);
      await http.delete(`/api/v2/categories/${concept}`).set('Authorization', asBruno).expect(404);

      await http
        .post(`/api/v2/categories/${concept}/merge`)
        .set('Authorization', asBruno)
        .send({ targetId: Number(brunoConceptId) })
        .expect(404);
      const intoAna = await http
        .post(`/api/v2/categories/${String(brunoConceptId)}/merge`)
        .set('Authorization', asBruno)
        .send({ targetId: Number(a.conceptId) });
      expect([404, 422]).toContain(intoAna.status);

      const hung = await http
        .post('/api/v2/categories')
        .set('Authorization', asBruno)
        .send({ name: 'Colgada', kind: 'expense', parentId: Number(a.groupId) });
      expect([404, 422]).toContain(hung.status);
      const reassigned = await http
        .delete(`/api/v2/categories/${String(brunoConceptId)}?reassignTo=${String(a.conceptId)}`)
        .set('Authorization', asBruno);
      expect([404, 422]).toContain(reassigned.status);
      expect(await env.prisma.category.count({ where: { id: brunoConceptId } })).toBe(1);

      const reorder = await http
        .post('/api/v2/categories/reorder')
        .set('Authorization', asBruno)
        .send({ items: [{ id: Number(a.conceptId), sortOrder: 99 }] });
      expect([204, 404, 422]).toContain(reorder.status);

      const seed = await http.post('/api/v2/categories/seed').set('Authorization', asBruno);
      expect([201, 409]).toContain(seed.status);
    });

    expect(
      await env.prisma.transaction.count({
        where: { id: brunoTransactionId, categoryId: brunoConceptId },
      }),
    ).toBe(1);
  });

  covers([
    'GET /api/v2/transactions',
    'GET /api/v2/transactions/history',
    'POST /api/v2/transactions/transfer',
    'GET /api/v2/transactions/:id',
    'POST /api/v2/transactions',
    'PATCH /api/v2/transactions/:id',
    'DELETE /api/v2/transactions/:id',
  ]);
  it('transactions: Bruno cannot read, change or delete Ana’s movement, nor use her accounts or concepts', async () => {
    await untouched(async () => {
      const id = String(a.transactionId);
      const list = await http
        .get('/api/v2/transactions?perPage=200')
        .set('Authorization', asBruno)
        .expect(200);
      expectNoLeak(list.body);
      expect(list.body.data.map((t: { id: string | number }) => String(t.id))).not.toContain(id);

      const history = await http
        .get('/api/v2/transactions/history')
        .set('Authorization', asBruno)
        .expect(200);
      expect(JSON.stringify(history.body)).not.toContain('2020-');

      await http.get(`/api/v2/transactions/${id}`).set('Authorization', asBruno).expect(404);
      await http
        .patch(`/api/v2/transactions/${id}`)
        .set('Authorization', asBruno)
        .send({ amount: '1' })
        .expect(404);
      await http.delete(`/api/v2/transactions/${id}`).set('Authorization', asBruno).expect(404);

      for (const body of [
        { categoryId: Number(a.conceptId) },
        { accountId: Number(a.accountId) },
      ]) {
        const created = await http
          .post('/api/v2/transactions')
          .set('Authorization', asBruno)
          .send({ date: '2026-09-11', amount: '5', type: 'expense', ...body });
        expect([404, 422]).toContain(created.status);
      }
      const moved = await http
        .patch(`/api/v2/transactions/${String(brunoTransactionId)}`)
        .set('Authorization', asBruno)
        .send({ categoryId: Number(a.conceptId) });
      expect([404, 422]).toContain(moved.status);

      const transfer = await http
        .post('/api/v2/transactions/transfer')
        .set('Authorization', asBruno)
        .send({
          fromAccountId: Number(a.accountId),
          toAccountId: Number(a.accountId),
          date: '2026-09-11',
          amount: '5',
        });
      expect([404, 422]).toContain(transfer.status);

      // Idempotency is per user: Ana's externalRef gives Bruno his own row, never hers.
      const same = await http
        .post('/api/v2/transactions')
        .set('Authorization', asBruno)
        .send({ date: '2026-09-11', amount: '7', type: 'expense', externalRef: a.transactionRef });
      expect(String(same.body.data.id)).not.toBe(id);
      expect(same.body.data.amount).toBe('7.00');
    });

    expect(
      await env.prisma.transaction.count({ where: { userId: bruno.id, categoryId: a.conceptId } }),
    ).toBe(0);
  });

  it('splits: Bruno cannot split a movement into Ana’s concept, and merging his concepts never moves her splits', async () => {
    await untouched(async () => {
      const hers = { categoryId: Number(a.conceptId) };
      const mine = { categoryId: Number(brunoConceptId) };

      const created = await http
        .post('/api/v2/transactions')
        .set('Authorization', asBruno)
        .send({
          date: '2026-09-11',
          amount: '10',
          type: 'expense',
          splits: [
            { ...mine, amount: '4' },
            { ...hers, amount: '6' },
          ],
        });
      expect([404, 422]).toContain(created.status);

      const edited = await http
        .patch(`/api/v2/transactions/${String(brunoTransactionId)}`)
        .set('Authorization', asBruno)
        .send({ amount: '10', splits: [{ ...hers, amount: '10' }] });
      expect([404, 422]).toContain(edited.status);
    });
    expect(await env.prisma.transactionSplit.count({ where: { categoryId: a.conceptId } })).toBe(1); // only Ana's own seeded split

    // A split of Ana's that points at Bruno's concept: the data the missing
    // check above could leave behind. Merging that concept must not drag it
    // into the rest of Bruno's tree.
    const brunoConcept = await env.prisma.category.findUniqueOrThrow({
      where: { id: brunoConceptId },
    });
    const target = await env.prisma.category.create({
      data: { userId: bruno.id, parentId: brunoConcept.parentId, name: 'Agua B' },
    });
    const legacy = await env.prisma.transactionSplit.create({
      data: { transactionId: a.transactionId, categoryId: brunoConceptId, amount: '1' },
    });

    await http
      .post(`/api/v2/categories/${String(brunoConceptId)}/merge`)
      .set('Authorization', asBruno)
      .send({ targetId: Number(target.id) })
      .expect(201);

    const after = await env.prisma.transactionSplit.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(after.categoryId).not.toBe(target.id);
  });

  covers([
    'GET /api/v2/transactions/:id/receipts',
    'POST /api/v2/transactions/:id/receipts',
    'DELETE /api/v2/transactions/:id/receipts/:receiptId',
    'GET /api/v2/transactions/:id/receipts/:receiptId',
  ]);
  it('receipts: Bruno cannot list, upload to, download or delete Ana’s receipts', async () => {
    await untouched(async () => {
      const tx = String(a.transactionId);
      const receipt = String(a.soporteId);
      const list = await http
        .get(`/api/v2/transactions/${tx}/receipts`)
        .set('Authorization', asBruno);
      expect([200, 404]).toContain(list.status);
      if (list.status === 200) expect(list.body.data).toEqual([]);
      await http
        .get(`/api/v2/transactions/${tx}/receipts/${receipt}`)
        .set('Authorization', asBruno)
        .expect(404);
      await http
        .delete(`/api/v2/transactions/${tx}/receipts/${receipt}`)
        .set('Authorization', asBruno)
        .expect(404);
      await http
        .post(`/api/v2/transactions/${tx}/receipts`)
        .set('Authorization', asBruno)
        .attach('files', PNG, { filename: 'r.png', contentType: 'image/png' })
        .expect(404);

      const mine = String(brunoTransactionId);
      await http
        .get(`/api/v2/transactions/${mine}/receipts/${receipt}`)
        .set('Authorization', asBruno)
        .expect(404);
      await http
        .delete(`/api/v2/transactions/${mine}/receipts/${receipt}`)
        .set('Authorization', asBruno)
        .expect(404);
    });
  });

  covers([
    'GET /api/v2/tags',
    'POST /api/v2/tags',
    'PATCH /api/v2/tags/:id',
    'DELETE /api/v2/tags/:id',
  ]);
  it('tags: Bruno never lists Ana’s tags and cannot change or delete them', async () => {
    await untouched(async () => {
      const id = String(a.tagId);
      expectNoLeak((await http.get('/api/v2/tags').set('Authorization', asBruno).expect(200)).body);
      await http
        .patch(`/api/v2/tags/${id}`)
        .set('Authorization', asBruno)
        .send({ name: 'x' })
        .expect(404);
      await http.delete(`/api/v2/tags/${id}`).set('Authorization', asBruno).expect(404);
      const created = await http
        .post('/api/v2/tags')
        .set('Authorization', asBruno)
        .send({ name: `${MARK}-tag` });
      expect([200, 201]).toContain(created.status);
      expect(String(created.body.data.id)).not.toBe(id);
    });
  });

  covers([
    'GET /api/v2/categorization/suggest',
    'POST /api/v2/categorization/learn',
    'POST /api/v2/transactions/interpret',
    'POST /api/v2/transactions/capture',
  ]);
  it('classification: Ana’s rules and keywords never classify Bruno’s text, and he cannot teach a rule into her tree', async () => {
    await untouched(async () => {
      const anaConcept = String(a.conceptId);
      const text = `${MARK} supermercado`;

      const suggestion = await http
        .get('/api/v2/categorization/suggest')
        .query({ description: text })
        .set('Authorization', asBruno);
      expect(suggestion.status).toBe(200);
      expect(JSON.stringify(suggestion.body)).not.toContain(`"${anaConcept}"`);
      expectNoLeak(suggestion.body);

      const learn = await http
        .post('/api/v2/categorization/learn')
        .set('Authorization', asBruno)
        .send({ description: 'algo de Bruno', categoryId: Number(a.conceptId) });
      expect([404, 422]).toContain(learn.status);

      const interpreted = await http
        .post('/api/v2/transactions/interpret')
        .set('Authorization', asBruno)
        .send({ text, amount: '9000' });
      expect(interpreted.status).toBeLessThan(300);
      expect(JSON.stringify(interpreted.body)).not.toContain(`"${anaConcept}"`);
      expectNoLeak(interpreted.body);

      const captureWithHerConcept = await http
        .post('/api/v2/transactions/capture')
        .set('Authorization', asBruno)
        .send({
          source: 'ios_manual',
          externalRef: 'bruno-1',
          amount: '9000',
          categoryId: anaConcept,
        });
      expect([404, 422]).toContain(captureWithHerConcept.status);

      const captureWithHerRef = await http
        .post('/api/v2/transactions/capture')
        .set('Authorization', asBruno)
        .send({ source: 'ios_manual', externalRef: a.transactionRef, amount: '9000' });
      expectNoLeak(captureWithHerRef.body);
      expect(JSON.stringify(captureWithHerRef.body)).not.toContain(`"${String(a.transactionId)}"`);
    });

    expect(
      await env.prisma.categoryRule.count({ where: { userId: bruno.id, categoryId: a.conceptId } }),
    ).toBe(0);
    expect(
      await env.prisma.transaction.count({ where: { userId: bruno.id, categoryId: a.conceptId } }),
    ).toBe(0);
  });

  covers(['GET /api/v2/dashboard']);
  it('dashboard: Bruno’s summary has none of Ana’s money, and computing it writes nothing of hers', async () => {
    await untouched(async () => {
      for (const query of ['', '?from=2020-01-01&to=2026-12-31']) {
        const response = await http.get(`/api/v2/dashboard${query}`).set('Authorization', asBruno);
        expect(response.status).toBe(200);
        expectNoLeak(response.body);
        expect(JSON.stringify(response.body)).not.toContain('777777');
      }
    });
  });

  covers(['GET /api/v2/preferences', 'PATCH /api/v2/preferences']);
  it('preferences: Bruno reads and writes only his own', async () => {
    await untouched(async () => {
      const mine = await http.get('/api/v2/preferences').set('Authorization', asBruno).expect(200);
      expect(mine.body.data.accountsEnabled).toBe(false);
      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asBruno)
        .send({ accountsEnabled: false })
        .expect(200);
    });
  });

  covers(['GET /api/v2/auth/me', 'POST /api/v2/auth/logout-all']);
  it('session: /auth/me is Bruno, and closing all his sessions leaves Ana signed in', async () => {
    const me = await http.get('/api/v2/auth/me').set('Authorization', asBruno).expect(200);
    expect(JSON.stringify(me.body)).not.toContain(ana.email);

    await http
      .post('/api/v2/auth/logout-all')
      .set('Authorization', asBruno)
      .expect((r) => expect(r.status).toBeLessThan(300));
    await http.get('/api/v2/auth/me').set('Authorization', env.como(ana)).expect(200);
  });

  const adminRoutes = [
    'GET /api/v2/admin/users',
    'POST /api/v2/admin/users/:id/approve',
    'POST /api/v2/admin/users/:id/suspend',
    'POST /api/v2/admin/users/:id/reactivate',
    'POST /api/v2/admin/users/:id/role',
    'POST /api/v2/admin/users/:id/reset-password',
    'GET /api/v2/admin/audit-log',
  ];
  covers(adminRoutes);
  it('admin: a regular user reaches no admin route', async () => {
    await untouched(async () => {
      for (const route of adminRoutes) {
        const [method, path] = route.split(' ') as [string, string];
        const response = await (http as unknown as Record<string, (p: string) => request.Test>)[
          method.toLowerCase()
        ]!(path.replace(':id', String(ana.id)))
          .set('Authorization', asBruno)
          .send({ role: 'admin' });
        expect(response.status).toBe(403);
      }
    });
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: bruno.id } })).role).toBe(
      'user',
    );
  });

  it('every registered API route is v2, and covered here or exempt with a reason', () => {
    const api = registeredRoutes(env.app).filter((r) => !r.includes('*') && r.includes('/api/'));
    const registered = api.filter((r) => r.includes('/api/v2/'));
    // A route under any other prefix (a v3, a route outside the versioning)
    // would escape this suite, so it fails here.
    expect(api.filter((r) => !r.includes('/api/v2/'))).toEqual([]);
    const missing = registered.filter((r) => !COVERED.has(r) && !(r in EXEMPT));
    const stale = [...Object.keys(EXEMPT), ...COVERED].filter((r) => !registered.includes(r));

    expect(registered.length).toBeGreaterThan(40);
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });
});
