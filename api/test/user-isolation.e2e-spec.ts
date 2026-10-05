import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

/**
 * Phase 6.5: one user can never reach another user's data.
 *
 * Isolation depends on every Prisma query carrying `user_id`; nothing in the
 * database enforces it yet (RLS is evaluated in phase 7). This suite is the
 * check: Ana owns one of everything, and Bruno —a regular, authenticated
 * user— calls EVERY route with Ana's ids, or with Ana's ids inside his own
 * request bodies. He must get a 404/422, see none of her data in his lists,
 * and leave every one of her rows exactly as it was.
 *
 * The last test walks the routes the app actually registers and fails if one
 * is neither covered here nor exempt with a reason. A new endpoint therefore
 * cannot ship without someone deciding how it is isolated.
 */

/** Everything Ana owns carries this, so a leak shows up in any response body. */
const MARK = 'ANA-PRIVATE';

/** Routes this suite attacks. Kept by hand, checked against the real router at the end. */
const COVERED = new Set<string>();
/** Routes with no per-user data to isolate, each with its reason. */
const EXEMPT: Record<string, string> = {
  'POST /api/v1/auth/register': 'public; creates a new account, reads nobody else',
  'POST /api/v1/auth/login': 'public; the credentials select the user',
  'POST /api/v1/auth/refresh': 'public; the refresh token selects the session',
  'POST /api/v1/auth/logout': 'public; revokes only the session of the token it is given',
  'POST /api/v1/auth/change-password':
    'acts on the token subject only (covered in auth.e2e-spec); a wrong password here would lock the test user out',
  'GET /api/v1/health': 'no user data',
};

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

interface AnaData {
  accountId: bigint;
  centerId: bigint;
  groupId: bigint;
  conceptId: bigint;
  transactionId: bigint;
  transactionRef: string;
  tagId: bigint;
  soporteId: bigint;
  ruleId: bigint;
}

describe('User isolation (e2e)', () => {
  let env: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let ana: UsuarioDePrueba;
  let bruno: UsuarioDePrueba;
  let asBruno: string;
  let a: AnaData;
  /** Bruno's own concept and movement, for requests that mix his ids with Ana's. */
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

    const center = await env.prisma.category.create({ data: { userId: bruno.id, name: 'Casa B' } });
    const group = await env.prisma.category.create({
      data: { userId: bruno.id, name: 'Servicios B', parentId: center.id },
    });
    brunoConceptId = (
      await env.prisma.category.create({ data: { userId: bruno.id, name: 'Luz B', parentId: group.id } })
    ).id;
    brunoTransactionId = (
      await env.prisma.transaction.create({
        data: {
          userId: bruno.id,
          date: new Date('2026-09-10'),
          period: new Date('2026-09-01'),
          amount: '1000',
          categoryId: brunoConceptId,
        },
      })
    ).id;
  });

  /** Snapshot of every row Ana owns, to prove nothing of hers changed. */
  async function anaSnapshot(): Promise<string> {
    const where = { userId: ana.id };
    const [accounts, categories, transactions, tags, soportes, rules, preferences] = await Promise.all([
      env.prisma.account.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.category.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.transaction.findMany({ where, orderBy: { id: 'asc' }, include: { tags: true, splits: true } }),
      env.prisma.tag.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.soporte.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.categoryRule.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.userPreference.findMany({ where, orderBy: { id: 'asc' } }),
    ]);
    return JSON.stringify({ accounts, categories, transactions, tags, soportes, rules, preferences }, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
  }

  /** Runs `attack` as Bruno and checks that Ana's data is byte-for-byte unchanged afterwards. */
  async function untouched(attack: () => Promise<unknown>): Promise<void> {
    const before = await anaSnapshot();
    await attack();
    expect(await anaSnapshot()).toBe(before);
  }

  function cover(route: string): void {
    COVERED.add(route);
  }

  function expectNoLeak(body: unknown): void {
    expect(JSON.stringify(body)).not.toContain(MARK);
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  it('accounts: Bruno cannot read, change or delete Ana’s account, and never lists it', async () => {
    cover('GET /api/v1/accounts');
    cover('GET /api/v1/accounts/:id');
    cover('PATCH /api/v1/accounts/:id');
    cover('DELETE /api/v1/accounts/:id');
    cover('POST /api/v1/accounts');

    await untouched(async () => {
      const id = String(a.accountId);
      expectNoLeak((await http.get('/api/v1/accounts').set('Authorization', asBruno).expect(200)).body);
      await http.get(`/api/v1/accounts/${id}`).set('Authorization', asBruno).expect(404);
      await http.patch(`/api/v1/accounts/${id}`).set('Authorization', asBruno).send({ name: 'x' }).expect(404);
      await http.delete(`/api/v1/accounts/${id}`).set('Authorization', asBruno).expect(404);

      const created = await http
        .post('/api/v1/accounts')
        .set('Authorization', asBruno)
        .send({ name: 'Mía', type: 'cash' })
        .expect(201);
      expectNoLeak(created.body);
    });
  });

  // ── Categories ─────────────────────────────────────────────────────────────

  it('categories: Bruno cannot read, change, delete, merge or hang anything from Ana’s tree', async () => {
    for (const route of [
      'GET /api/v1/categories',
      'GET /api/v1/categories/:id',
      'POST /api/v1/categories',
      'POST /api/v1/categories/seed',
      'POST /api/v1/categories/reorder',
      'POST /api/v1/categories/:id/unificar',
      'PATCH /api/v1/categories/:id',
      'GET /api/v1/categories/:id/usos',
      'DELETE /api/v1/categories/:id',
    ]) {
      cover(route);
    }

    await untouched(async () => {
      const concept = String(a.conceptId);
      expectNoLeak((await http.get('/api/v1/categories').set('Authorization', asBruno).expect(200)).body);
      await http.get(`/api/v1/categories/${concept}`).set('Authorization', asBruno).expect(404);
      await http.get(`/api/v1/categories/${concept}/usos`).set('Authorization', asBruno).expect(404);
      await http.patch(`/api/v1/categories/${concept}`).set('Authorization', asBruno).send({ name: 'x' }).expect(404);
      await http.delete(`/api/v1/categories/${concept}`).set('Authorization', asBruno).expect(404);

      // Ana's concept as the thing to merge, and as the destination of Bruno's.
      await http
        .post(`/api/v1/categories/${concept}/unificar`)
        .set('Authorization', asBruno)
        .send({ destino_id: Number(brunoConceptId) })
        .expect(404);
      const intoAna = await http
        .post(`/api/v1/categories/${String(brunoConceptId)}/unificar`)
        .set('Authorization', asBruno)
        .send({ destino_id: Number(a.conceptId) });
      expect([404, 422]).toContain(intoAna.status);

      // Ana's group as the parent of a new category, and as the target of a delete-and-reassign.
      const hung = await http
        .post('/api/v1/categories')
        .set('Authorization', asBruno)
        .send({ name: 'Colgada', kind: 'expense', parent_id: Number(a.groupId) });
      expect([404, 422]).toContain(hung.status);
      const reassigned = await http
        .delete(`/api/v1/categories/${String(brunoConceptId)}?reasignar_a=${String(a.conceptId)}`)
        .set('Authorization', asBruno);
      expect([404, 422]).toContain(reassigned.status);
      expect(await env.prisma.category.count({ where: { id: brunoConceptId } })).toBe(1);

      // Reordering Ana's ids must not move them.
      const reorder = await http
        .post('/api/v1/categories/reorder')
        .set('Authorization', asBruno)
        .send({ items: [{ id: Number(a.conceptId), sort_order: 99 }] });
      expect([204, 404, 422]).toContain(reorder.status);

      // Bruno already has a tree, so the seed declines (409); either way it must not touch Ana's.
      const seed = await http.post('/api/v1/categories/seed').set('Authorization', asBruno);
      expect([201, 409]).toContain(seed.status);
    });

    expect(await env.prisma.transaction.count({ where: { id: brunoTransactionId, categoryId: brunoConceptId } })).toBe(1);
  });

  // ── Transactions ───────────────────────────────────────────────────────────

  it('transactions: Bruno cannot read, change or delete Ana’s movement, nor use her accounts or concepts', async () => {
    for (const route of [
      'GET /api/v1/transactions',
      'GET /api/v1/transactions/historia',
      'POST /api/v1/transactions/transfer',
      'GET /api/v1/transactions/:id',
      'POST /api/v1/transactions',
      'PATCH /api/v1/transactions/:id',
      'DELETE /api/v1/transactions/:id',
    ]) {
      cover(route);
    }

    await untouched(async () => {
      const id = String(a.transactionId);
      const list = await http.get('/api/v1/transactions?per_page=100').set('Authorization', asBruno).expect(200);
      expectNoLeak(list.body);
      expect(list.body.data.map((t: { id: string }) => String(t.id))).not.toContain(id);

      // Ana's movement is from 2020; Bruno's history must not reach back there.
      const history = await http.get('/api/v1/transactions/historia').set('Authorization', asBruno).expect(200);
      expect(JSON.stringify(history.body)).not.toContain('2020-');

      await http.get(`/api/v1/transactions/${id}`).set('Authorization', asBruno).expect(404);
      await http.patch(`/api/v1/transactions/${id}`).set('Authorization', asBruno).send({ amount: '1' }).expect(404);
      await http.delete(`/api/v1/transactions/${id}`).set('Authorization', asBruno).expect(404);

      for (const body of [{ category_id: Number(a.conceptId) }, { account_id: Number(a.accountId) }]) {
        const created = await http
          .post('/api/v1/transactions')
          .set('Authorization', asBruno)
          .send({ date: '2026-09-11', amount: '5', type: 'expense', ...body });
        expect([404, 422]).toContain(created.status);
      }
      const moved = await http
        .patch(`/api/v1/transactions/${String(brunoTransactionId)}`)
        .set('Authorization', asBruno)
        .send({ category_id: Number(a.conceptId) });
      expect([404, 422]).toContain(moved.status);

      const transfer = await http
        .post('/api/v1/transactions/transfer')
        .set('Authorization', asBruno)
        .send({ from_account_id: Number(a.accountId), to_account_id: Number(a.accountId), date: '2026-09-11', amount: '5' });
      expect([404, 422]).toContain(transfer.status);

      // Idempotency is per user: Ana's external_ref must give Bruno his own row, never hers.
      const same = await http
        .post('/api/v1/transactions')
        .set('Authorization', asBruno)
        .send({ date: '2026-09-11', amount: '7', type: 'expense', external_ref: a.transactionRef });
      // (The ref itself carries MARK because Bruno sent it; what matters is whose row comes back.)
      expect(String(same.body.data.id)).not.toBe(id);
      expect(same.body.data.amount).toBe('7.00');
    });

    expect(
      await env.prisma.transaction.count({ where: { userId: bruno.id, categoryId: a.conceptId } }),
    ).toBe(0);
  });

  // ── Receipts (soportes) ────────────────────────────────────────────────────

  it('soportes: Bruno cannot list, upload to, download or delete Ana’s receipts', async () => {
    for (const route of [
      'GET /api/v1/transactions/:id/soportes',
      'POST /api/v1/transactions/:id/soportes',
      'DELETE /api/v1/transactions/:id/soportes/:soporteId',
      'GET /api/v1/transactions/:id/soportes/:soporteId',
    ]) {
      cover(route);
    }

    await untouched(async () => {
      const tx = String(a.transactionId);
      const soporte = String(a.soporteId);
      // The list is scoped by user: for her movement Bruno gets an empty list, which confirms nothing.
      const list = await http.get(`/api/v1/transactions/${tx}/soportes`).set('Authorization', asBruno);
      expect([200, 404]).toContain(list.status);
      if (list.status === 200) expect(list.body.data).toEqual([]);
      await http.get(`/api/v1/transactions/${tx}/soportes/${soporte}`).set('Authorization', asBruno).expect(404);
      await http.delete(`/api/v1/transactions/${tx}/soportes/${soporte}`).set('Authorization', asBruno).expect(404);
      await http
        .post(`/api/v1/transactions/${tx}/soportes`)
        .set('Authorization', asBruno)
        .attach('archivos', PNG, { filename: 'r.png', contentType: 'image/png' })
        .expect(404);

      // His own movement, her receipt id.
      const mine = String(brunoTransactionId);
      await http.get(`/api/v1/transactions/${mine}/soportes/${soporte}`).set('Authorization', asBruno).expect(404);
      await http.delete(`/api/v1/transactions/${mine}/soportes/${soporte}`).set('Authorization', asBruno).expect(404);
    });
  });

  // ── Tags ───────────────────────────────────────────────────────────────────

  it('tags: Bruno never lists Ana’s tags and cannot change or delete them', async () => {
    for (const route of ['GET /api/v1/tags', 'POST /api/v1/tags', 'PATCH /api/v1/tags/:id', 'DELETE /api/v1/tags/:id']) {
      cover(route);
    }

    await untouched(async () => {
      const id = String(a.tagId);
      expectNoLeak((await http.get('/api/v1/tags').set('Authorization', asBruno).expect(200)).body);
      await http.patch(`/api/v1/tags/${id}`).set('Authorization', asBruno).send({ name: 'x' }).expect(404);
      await http.delete(`/api/v1/tags/${id}`).set('Authorization', asBruno).expect(404);
      // Same name as Ana's: Bruno gets his own tag, not hers.
      const created = await http.post('/api/v1/tags').set('Authorization', asBruno).send({ name: `${MARK}-tag` });
      expect([200, 201]).toContain(created.status);
      expect(String(created.body.data.id)).not.toBe(id);
    });
  });

  // ── Classification, interpretation and capture ─────────────────────────────

  it('classification: Ana’s rules and keywords never classify Bruno’s text, and he cannot teach a rule into her tree', async () => {
    for (const route of [
      'GET /api/v1/categorization/suggest',
      'POST /api/v1/categorization/learn',
      'POST /api/v1/transactions/interpret',
      'POST /api/v1/transactions/capture',
    ]) {
      cover(route);
    }

    await untouched(async () => {
      const anaConcept = String(a.conceptId);
      // The text matches both Ana's learned rule and her concept's keyword.
      const text = `${MARK} supermercado`;

      const suggestion = await http
        .get('/api/v1/categorization/suggest')
        .query({ description: text })
        .set('Authorization', asBruno);
      expect([200, 204]).toContain(suggestion.status);
      expect(JSON.stringify(suggestion.body)).not.toContain(`"${anaConcept}"`);
      expectNoLeak(suggestion.body);

      const learn = await http
        .post('/api/v1/categorization/learn')
        .set('Authorization', asBruno)
        .send({ description: 'algo de Bruno', category_id: Number(a.conceptId) });
      expect([404, 422]).toContain(learn.status);

      const interpreted = await http
        .post('/api/v1/transactions/interpret')
        .set('Authorization', asBruno)
        .send({ texto: text, monto: '9000' });
      expect(interpreted.status).toBeLessThan(300);
      expect(JSON.stringify(interpreted.body)).not.toContain(`"${anaConcept}"`);
      expectNoLeak(interpreted.body);

      const captureWithHerConcept = await http
        .post('/api/v1/transactions/capture')
        .set('Authorization', asBruno)
        .send({ source: 'ios_manual', external_ref: 'bruno-1', monto: '9000', category_id: anaConcept });
      expect([404, 422]).toContain(captureWithHerConcept.status);

      // Idempotency is per user: her external_ref must not return her movement.
      const captureWithHerRef = await http
        .post('/api/v1/transactions/capture')
        .set('Authorization', asBruno)
        .send({ source: 'ios_manual', external_ref: a.transactionRef, monto: '9000' });
      expectNoLeak(captureWithHerRef.body);
      expect(JSON.stringify(captureWithHerRef.body)).not.toContain(`"${String(a.transactionId)}"`);
    });

    expect(await env.prisma.categoryRule.count({ where: { userId: bruno.id, categoryId: a.conceptId } })).toBe(0);
    expect(await env.prisma.transaction.count({ where: { userId: bruno.id, categoryId: a.conceptId } })).toBe(0);
  });

  // ── Dashboard, preferences, the session ────────────────────────────────────

  it('dashboard: Bruno’s summary has none of Ana’s money, and computing it writes nothing of hers', async () => {
    cover('GET /api/v1/dashboard');

    await untouched(async () => {
      for (const query of ['', '?from=2020-01-01&to=2026-12-31']) {
        const response = await http.get(`/api/v1/dashboard${query}`).set('Authorization', asBruno);
        expect(response.status).toBe(200);
        expectNoLeak(response.body);
        expect(JSON.stringify(response.body)).not.toContain('777777');
      }
    });
  });

  it('preferences: Bruno reads and writes only his own', async () => {
    cover('GET /api/v1/preferences');
    cover('PATCH /api/v1/preferences');

    await untouched(async () => {
      const mine = await http.get('/api/v1/preferences').set('Authorization', asBruno).expect(200);
      expect(mine.body.data.cuentas_habilitadas).toBe(false);
      await http.patch('/api/v1/preferences').set('Authorization', asBruno).send({ cuentas_habilitadas: false }).expect(200);
    });
  });

  it('session: /auth/me is Bruno, and closing all his sessions leaves Ana signed in', async () => {
    cover('GET /api/v1/auth/me');
    cover('POST /api/v1/auth/logout-all');

    const me = await http.get('/api/v1/auth/me').set('Authorization', asBruno).expect(200);
    expect(JSON.stringify(me.body)).not.toContain(ana.email);

    await http.post('/api/v1/auth/logout-all').set('Authorization', asBruno).expect((r) => expect(r.status).toBeLessThan(300));
    await http.get('/api/v1/auth/me').set('Authorization', env.como(ana)).expect(200);
  });

  it('admin: a regular user reaches no admin route', async () => {
    const routes: [string, string][] = [
      ['get', '/api/v1/admin/users'],
      ['post', `/api/v1/admin/users/${String(ana.id)}/approve`],
      ['post', `/api/v1/admin/users/${String(ana.id)}/suspend`],
      ['post', `/api/v1/admin/users/${String(ana.id)}/reactivate`],
      ['post', `/api/v1/admin/users/${String(ana.id)}/role`],
      ['post', `/api/v1/admin/users/${String(ana.id)}/reset-password`],
      ['get', '/api/v1/admin/audit-log'],
    ];
    for (const [, path] of routes) {
      cover(`${routes.find(([, p]) => p === path)![0].toUpperCase()} ${path.replace(String(ana.id), ':id')}`);
    }

    await untouched(async () => {
      for (const [method, path] of routes) {
        const response = await (http as unknown as Record<string, (p: string) => request.Test>)
          [method](path)
          .set('Authorization', asBruno)
          .send({ role: 'admin' });
        expect(response.status).toBe(403);
      }
    });
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: bruno.id } })).role).toBe('user');
  });

  // ── The guard: no route escapes this suite ─────────────────────────────────

  it('every registered route is covered here or exempt with a reason', () => {
    const registered = registeredRoutes(env.app).filter((r) => !r.includes('*') && r.includes('/api/'));
    const missing = registered.filter((r) => !COVERED.has(r) && !(r in EXEMPT));
    const stale = [...Object.keys(EXEMPT), ...COVERED].filter((r) => !registered.includes(r));

    expect(registered.length).toBeGreaterThan(40);
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });
});

/** Ana owns one of every user-scoped row, each carrying `MARK`. */
async function seedAna(env: EntornoDePruebas, userId: bigint): Promise<AnaData> {
  const p = env.prisma;
  const account = await p.account.create({ data: { userId, name: `${MARK} cuenta`, type: 'cash' } });
  const center = await p.category.create({ data: { userId, name: `${MARK} centro` } });
  const group = await p.category.create({ data: { userId, name: `${MARK} grupo`, parentId: center.id } });
  const concept = await p.category.create({
    data: {
      userId,
      name: `${MARK} concepto`,
      parentId: group.id,
      recurrente: true,
      periodicidad: 'mensual',
      diaDePago: 1,
      presupuesto: '777777',
      pagoAutomatico: true,
      palabrasClave: [MARK, 'supermercado'],
    },
  });
  const tag = await p.tag.create({ data: { userId, name: `${MARK}-tag` } });
  const transactionRef = `${MARK}-ref`;
  const transaction = await p.transaction.create({
    data: {
      userId,
      accountId: account.id,
      date: new Date('2020-01-15'),
      period: new Date('2020-01-01'),
      amount: '777777',
      categoryId: concept.id,
      description: `${MARK} gasto`,
      merchant: `${MARK} comercio`,
      externalRef: transactionRef,
      tags: { create: [{ tagId: tag.id }] },
      splits: { create: [{ categoryId: concept.id, amount: '777777', note: `${MARK} split` }] },
    },
  });
  const soporte = await p.soporte.create({
    data: {
      userId,
      transactionId: transaction.id,
      nombreArchivo: `${MARK}.png`,
      mimeType: 'image/png',
      storageKey: `${MARK}/key.png`,
      tamano: 1,
      huella: '0'.repeat(64),
    },
  });
  const rule = await p.categoryRule.create({
    data: { userId, pattern: `${MARK.toLowerCase()} supermercado`, categoryId: concept.id, priority: 10 },
  });
  await p.userPreference.create({ data: { userId, prefKey: 'cuentas_habilitadas', prefValue: true } });

  return {
    accountId: account.id,
    centerId: center.id,
    groupId: group.id,
    conceptId: concept.id,
    transactionId: transaction.id,
    transactionRef,
    tagId: tag.id,
    soporteId: soporte.id,
    ruleId: rule.id,
  };
}

/** `METHOD /path/:param` for every route Express has registered. */
function registeredRoutes(app: INestApplication): string[] {
  const express = app.getHttpAdapter().getInstance() as {
    router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
    _router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
  };
  const stack = (express.router ?? express._router)?.stack ?? [];
  return stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route!.path}`)
      : [],
  );
}
