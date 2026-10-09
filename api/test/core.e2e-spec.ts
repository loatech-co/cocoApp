import request from 'supertest';

import { startApp, type TestEnvironment } from './helpers/app';

/**
 * Phase 1 — the core, against a real Postgres.
 *
 * What is protected here is what the PRD requires before moving on a phase:
 * that balances are derived correctly, that unbalanced splits are rejected,
 * and that no user can see or touch another's data.
 */
describe('Phase 1 — Core (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  // Two different people: everything that checks isolation rests on Beto not
  // being able to see a single byte of Ana's.
  let ana: string;
  let beto: string;

  const asAna = (): string => ana;
  const asBeto = (): string => beto;

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
    ana = env.as(await env.createUser({ displayName: 'Ana' }));
    beto = env.as(await env.createUser({ displayName: 'Beto' }));
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const createAccount = async (auth: string, body: Record<string, unknown> = {}) => {
    const response = await http
      .post('/api/v2/accounts')
      .set('Authorization', auth)
      .send({ name: 'Bancolombia', type: 'debit', openingBalance: '0', ...body })
      .expect(201);
    return response.body.data;
  };

  const createCategory = async (auth: string, body: Record<string, unknown> = {}) => {
    const response = await http
      .post('/api/v2/categories')
      .set('Authorization', auth)
      .send({ name: 'Mercado', kind: 'expense', ...body })
      .expect(201);
    return response.body.data;
  };

  // ── Derived balances ───────────────────────────────────────────────────────

  describe('Derived balances', () => {
    it('the balance matches the sum of the transactions to the cent', async () => {
      const account = await createAccount(asAna(), { openingBalance: '500000' });

      for (const transaction of [
        { amount: '1000000', type: 'income' },
        { amount: '300000', type: 'expense' },
      ]) {
        await http
          .post('/api/v2/transactions')
          .set('Authorization', asAna())
          .send({ accountId: Number(account.id), date: '2026-08-05', ...transaction })
          .expect(201);
      }

      const response = await http
        .get(`/api/v2/accounts/${account.id}`)
        .set('Authorization', asAna())
        .expect(200);

      expect(response.body.data.balance).toBe('1200000.00');
    });

    it('a pending transaction does not change the confirmed balance, but does change the projected one', async () => {
      const account = await createAccount(asAna(), { openingBalance: '100000' });

      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '50000',
          type: 'expense',
          status: 'pending',
        })
        .expect(201);

      const response = await http
        .get(`/api/v2/accounts/${account.id}`)
        .set('Authorization', asAna())
        .expect(200);

      expect(response.body.data.balance).toBe('100000.00');
      expect(response.body.data.balanceProjected).toBe('50000.00');
    });

    it('on a credit card a purchase raises the debt and lowers the available credit', async () => {
      const card = await createAccount(asAna(), {
        name: 'Visa',
        type: 'credit',
        creditLimit: '5000000',
        openingBalance: '0',
      });

      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(card.id),
          date: '2026-08-05',
          amount: '1240000',
          type: 'expense',
        })
        .expect(201);

      const response = await http
        .get(`/api/v2/accounts/${card.id}`)
        .set('Authorization', asAna())
        .expect(200);

      expect(response.body.data.balance).toBe('1240000.00');
      expect(response.body.data.availableCredit).toBe('3760000.00');
    });
  });

  // ── Splits ─────────────────────────────────────────────────────────────────

  describe('Splits', () => {
    it('accepts a transaction whose splits add up exactly', async () => {
      const account = await createAccount(asAna());
      const groceries = await createCategory(asAna(), { name: 'Mercado' });
      const cleaning = await createCategory(asAna(), { name: 'Aseo' });

      const response = await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '150000',
          type: 'expense',
          splits: [
            { categoryId: Number(groceries.id), amount: '105000', note: 'Mercado' },
            { categoryId: Number(cleaning.id), amount: '45000', note: 'Aseo' },
          ],
        })
        .expect(201);

      expect(response.body.data.splits).toHaveLength(2);
    });

    it('rejects with 422 if the splits do not add up to the amount, and persists nothing', async () => {
      const account = await createAccount(asAna());

      const response = await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '150000',
          type: 'expense',
          splits: [{ amount: '105000' }, { amount: '45000.01' }],
        })
        .expect(422);

      expect(response.body.detail).toMatch(/no coincide/i);

      // The ROLLBACK must have left the database untouched.
      const list = await http.get('/api/v2/transactions').set('Authorization', asAna()).expect(200);
      expect(list.body.meta.total).toBe(0);
    });
  });

  // ── Transfers ──────────────────────────────────────────────────────────────

  describe('Transfers', () => {
    it('creates two paired legs and does not change the total net worth', async () => {
      const source = await createAccount(asAna(), { name: 'Ahorros', openingBalance: '1000000' });
      const target = await createAccount(asAna(), { name: 'Efectivo', type: 'cash' });

      const response = await http
        .post('/api/v2/transactions/transfer')
        .set('Authorization', asAna())
        .send({
          fromAccountId: Number(source.id),
          toAccountId: Number(target.id),
          date: '2026-08-05',
          amount: '300000',
        })
        .expect(201);

      expect(response.body.data.legs).toHaveLength(2);

      const accounts = await http.get('/api/v2/accounts').set('Authorization', asAna()).expect(200);

      const balances = Object.fromEntries(
        accounts.body.data.map((account: { name: string; balance: string }) => [
          account.name,
          account.balance,
        ]),
      );

      expect(balances.Ahorros).toBe('700000.00');
      expect(balances.Efectivo).toBe('300000.00');
    });

    it('rejects a transfer to the same account', async () => {
      const account = await createAccount(asAna());

      await http
        .post('/api/v2/transactions/transfer')
        .set('Authorization', asAna())
        .send({
          fromAccountId: Number(account.id),
          toAccountId: Number(account.id),
          date: '2026-08-05',
          amount: '100000',
        })
        .expect(422);
    });

    it('deleting one leg deletes the other: a transfer is never left one-legged', async () => {
      const source = await createAccount(asAna(), { name: 'A', openingBalance: '500000' });
      const target = await createAccount(asAna(), { name: 'B', type: 'cash' });

      const transfer = await http
        .post('/api/v2/transactions/transfer')
        .set('Authorization', asAna())
        .send({
          fromAccountId: Number(source.id),
          toAccountId: Number(target.id),
          date: '2026-08-05',
          amount: '200000',
        })
        .expect(201);

      const firstLeg = transfer.body.data.legs[0];

      await http
        .delete(`/api/v2/transactions/${firstLeg.id}`)
        .set('Authorization', asAna())
        .expect(204);

      const list = await http.get('/api/v2/transactions').set('Authorization', asAna()).expect(200);

      expect(list.body.meta.total).toBe(0);
    });
  });

  // ── Non-rigidity ───────────────────────────────────────────────────────────

  describe('No-rigidez', () => {
    it('saves a transaction WITHOUT a category without complaining', async () => {
      const account = await createAccount(asAna());

      const response = await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '32000',
          type: 'expense',
        })
        .expect(201);

      expect(response.body.data.categoryId).toBeNull();
    });

    it('allows going over the card limit: it informs, it does not block', async () => {
      const card = await createAccount(asAna(), {
        name: 'Visa',
        type: 'credit',
        creditLimit: '1000000',
      });

      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(card.id),
          date: '2026-08-05',
          amount: '1150000',
          type: 'expense',
        })
        .expect(201);

      const response = await http
        .get(`/api/v2/accounts/${card.id}`)
        .set('Authorization', asAna())
        .expect(200);

      expect(response.body.data.availableCredit).toBe('-150000.00');
    });
  });

  // ── Authorisation by ownership ─────────────────────────────────────────────

  describe('Scoping by user', () => {
    it("Beto does not see Ana's transactions", async () => {
      const account = await createAccount(asAna());
      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '50000',
          type: 'expense',
        })
        .expect(201);

      const list = await http
        .get('/api/v2/transactions')
        .set('Authorization', asBeto())
        .expect(200);

      expect(list.body.meta.total).toBe(0);
    });

    it("asking for someone else's account by id answers 404, not 403: it does not confirm it exists", async () => {
      const account = await createAccount(asAna());

      await http.get(`/api/v2/accounts/${account.id}`).set('Authorization', asBeto()).expect(404);
    });

    it("Beto cannot edit an account of Ana's", async () => {
      const account = await createAccount(asAna());

      await http
        .patch(`/api/v2/accounts/${account.id}`)
        .set('Authorization', asBeto())
        .send({ name: 'Secuestrada' })
        .expect(404);
    });

    it("Beto cannot create a transaction against Ana's account", async () => {
      const account = await createAccount(asAna());

      await http
        .post('/api/v2/transactions')
        .set('Authorization', asBeto())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '50000',
          type: 'expense',
        })
        .expect(422);
    });

    it('sending user_id in the body does not change the owner: the pipe rejects it', async () => {
      const account = await createAccount(asAna());

      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '50000',
          type: 'expense',
          userId: 99999,
        })
        .expect(400);
    });
  });

  // ── Categories ─────────────────────────────────────────────────────────────

  describe('Categories', () => {
    it('a static center is saved on create and can be changed later', async () => {
      // The public shape is built field by field, so a new field gets lost
      // silently with the API returning 201: it already happened with
      // recurrence. This test exists so it does not happen again.
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos', isStatic: true });
      expect(costCenter.isStatic).toBe(true);

      // And it reaches the tree, which is where the transactions table reads it from.
      const tree = await http.get('/api/v2/categories').set('Authorization', asAna()).expect(200);
      expect(
        tree.body.data.find((c: { id: number | string }) => Number(c.id) === Number(costCenter.id))
          .isStatic,
      ).toBe(true);

      const loose = await http
        .patch(`/api/v2/categories/${Number(costCenter.id)}`)
        .set('Authorization', asAna())
        .send({ isStatic: false })
        .expect(200);
      expect(loose.body.data.isStatic).toBe(false);
    });

    it('a center is born dynamic unless someone says otherwise', async () => {
      const costCenter = await createCategory(asAna(), { name: 'Costos variables' });
      expect(costCenter.isStatic).toBe(false);
    });

    it('rejects a cycle in the tree with 422', async () => {
      const parent = await createCategory(asAna(), { name: 'Hogar' });
      const child = await createCategory(asAna(), {
        name: 'Servicios',
        parentId: Number(parent.id),
      });

      await http
        .patch(`/api/v2/categories/${parent.id}`)
        .set('Authorization', asAna())
        .send({ parentId: Number(child.id) })
        .expect(422);
    });

    it('returns the nested tree, not a flat list', async () => {
      const parent = await createCategory(asAna(), { name: 'Hogar' });
      await createCategory(asAna(), { name: 'Servicios', parentId: Number(parent.id) });

      const response = await http
        .get('/api/v2/categories')
        .set('Authorization', asAna())
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].children).toHaveLength(1);
      expect(response.body.data[0].children[0].name).toBe('Servicios');
    });

    it('seeds the initial dictionary and then refuses to repeat it', async () => {
      const first = await http
        .post('/api/v2/categories/seed')
        .set('Authorization', asAna())
        .expect(201);

      // The template is a SNAPSHOT of two centers and seven categories since
      // 17 September 2026 (see `categories.template.ts`): nine rows. It used to
      // seed a dictionary of forty-odd concepts.
      expect(first.body.data.created).toBe(9);

      await http.post('/api/v2/categories/seed').set('Authorization', asAna()).expect(409);
    });
  });

  // ── Moving a concept to another group ──────────────────────────────────────

  describe('Moving a concept to another group', () => {
    it('accepts it within the same center', async () => {
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const housing = await createCategory(asAna(), {
        name: 'Vivienda',
        parentId: Number(costCenter.id),
      });
      const utilities = await createCategory(asAna(), {
        name: 'Servicios públicos',
        parentId: Number(costCenter.id),
      });
      const concept = await createCategory(asAna(), {
        name: 'Claro Móvil',
        parentId: Number(housing.id),
      });

      const moved = await http
        .patch(`/api/v2/categories/${Number(concept.id)}`)
        .set('Authorization', asAna())
        .send({ parentId: Number(utilities.id) })
        .expect(200);

      expect(Number(moved.body.data.parentId)).toBe(Number(utilities.id));
    });

    it("accepts it together with the rest of the sheet's fields", async () => {
      // As the interface sends it: the name, the recurrence and the group in the
      // same request.
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const a = await createCategory(asAna(), { name: 'A', parentId: Number(costCenter.id) });
      const b = await createCategory(asAna(), { name: 'B', parentId: Number(costCenter.id) });
      const concept = await createCategory(asAna(), {
        name: 'Claro',
        parentId: Number(a.id),
      });

      const moved = await http
        .patch(`/api/v2/categories/${Number(concept.id)}`)
        .set('Authorization', asAna())
        .send({
          name: 'Claro Móvil',
          isRecurring: true,
          periodicity: 'monthly',
          paymentDay: 1,
          paymentMonth: null,
          parentId: Number(b.id),
        })
        .expect(200);

      expect(Number(moved.body.data.parentId)).toBe(Number(b.id));
      expect(moved.body.data.name).toBe('Claro Móvil');
    });
  });

  // ── A category's icon ──────────────────────────────────────────────────────

  describe("A group's icon", () => {
    it('is saved on create, changed on edit and can be removed', async () => {
      /*
        Removing it is the case that needs testing, and not on a whim: the DTO
        declares `icon?: string`, so at first sight a `null` does not fit. It
        gets through thanks to `@IsOptional()`, which in class-validator skips
        validation for both `undefined` and `null`, and the service applies it
        because it tells "did not come" from "came empty" with `!== undefined`.

        Those are two behaviours of two libraries that could change without
        anyone noticing, and the symptom would be silent: the icon stays on
        and nobody knows why.
      */
      const group = await createCategory(asAna(), { name: 'Servicios', icon: 'house' });
      expect(group.icon).toBe('house');

      const changed = await http
        .patch(`/api/v2/categories/${Number(group.id)}`)
        .set('Authorization', asAna())
        .send({ icon: 'zap' })
        .expect(200);

      expect(changed.body.data.icon).toBe('zap');

      const withoutIcon = await http
        .patch(`/api/v2/categories/${Number(group.id)}`)
        .set('Authorization', asAna())
        .send({ icon: null })
        .expect(200);

      expect(withoutIcon.body.data.icon).toBeNull();
    });

    it('does not swallow a name longer than 64 characters', async () => {
      const group = await createCategory(asAna(), { name: 'Servicios' });

      await http
        .patch(`/api/v2/categories/${Number(group.id)}`)
        .set('Authorization', asAna())
        .send({ icon: 'x'.repeat(65) })
        .expect(400);
    });
  });

  // ── Deleting a category ────────────────────────────────────────────────────

  /**
   * Deleting a category is the only destructive operation on the tree, and
   * until now it had not a single test: it just refused as soon as there was
   * a transaction, so there was not much to check.
   *
   * Now it really deletes, and three things cannot fail silently: that the
   * transactions end up where they were told, that they are not left
   * unclassified by the `ON DELETE SET NULL`, and that the concepts of a
   * deleted group go with it instead of rising to cost centers.
   */
  describe('Deleting a category', () => {
    /** A three-level tree with a transaction hanging from the concept. */
    const withOneTransaction = async () => {
      const account = await createAccount(asAna());
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const group = await createCategory(asAna(), {
        name: 'Servicios públicos',
        parentId: Number(costCenter.id),
      });
      const concept = await createCategory(asAna(), {
        name: 'Aseo',
        parentId: Number(group.id),
      });
      const other = await createCategory(asAna(), { name: 'Variables' });

      const transaction = await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-09-16',
          amount: '450000',
          type: 'expense',
          categoryId: Number(concept.id),
        })
        .expect(201);

      return { costCenter, group, concept, other, transaction: transaction.body.data };
    };

    it('counts the transactions of the SUBTREE, not only those of the row', async () => {
      // The transaction hangs from the concept, three levels below the center.
      // Counting only the center's id, a center with forty gave zero.
      const { costCenter, group, concept } = await withOneTransaction();

      for (const [category, subcategories] of [
        [costCenter, 2],
        [group, 1],
        [concept, 0],
      ] as const) {
        const response = await http
          .get(`/api/v2/categories/${Number(category.id)}/usage`)
          .set('Authorization', asAna())
          .expect(200);

        expect(response.body.data).toEqual({ transactions: 1, subcategories });
      }
    });

    it('refuses if there are transactions and it is not told where they go', async () => {
      const { concept } = await withOneTransaction();

      await http
        .delete(`/api/v2/categories/${Number(concept.id)}`)
        .set('Authorization', asAna())
        .expect(409);
    });

    it('reassigns the transactions and deletes', async () => {
      const { concept, other, transaction } = await withOneTransaction();

      await http
        .delete(`/api/v2/categories/${Number(concept.id)}?reassignTo=${Number(other.id)}`)
        .set('Authorization', asAna())
        .expect(204);

      // The transaction is still there, with its new category. What must NOT
      // happen is that it ends up null: `category_id` is `ON DELETE SET NULL`, so
      // a delete without reassigning leaves it unclassified silently.
      const after = await http
        .get(`/api/v2/transactions/${Number(transaction.id)}`)
        .set('Authorization', asAna())
        .expect(200);

      expect(Number(after.body.data.categoryId)).toBe(Number(other.id));
    });

    it('takes the whole subtree: the concepts do not rise to centers', async () => {
      // `parent_id` is `ON DELETE SET NULL`. Deleting only the group, its
      // concepts were left with a null parent and showed up as new cost centers
      // at the root of the tree.
      const { group, concept, other } = await withOneTransaction();

      await http
        .delete(`/api/v2/categories/${Number(group.id)}?reassignTo=${Number(other.id)}`)
        .set('Authorization', asAna())
        .expect(204);

      const tree = await http.get('/api/v2/categories').set('Authorization', asAna()).expect(200);

      const ids = tree.body.data.map((c: { id: string | number }) => Number(c.id));
      expect(ids).not.toContain(Number(concept.id));
      expect(ids).not.toContain(Number(group.id));
    });

    it('does not accept a target that is also being deleted', async () => {
      // Reassigning to the concept that hangs from the group being deleted leaves
      // the transactions unclassified, which is exactly what is to be avoided.
      const { group, concept } = await withOneTransaction();

      await http
        .delete(`/api/v2/categories/${Number(group.id)}?reassignTo=${Number(concept.id)}`)
        .set('Authorization', asAna())
        .expect(409);
    });

    it('without transactions no target is needed', async () => {
      const empty = await createCategory(asAna(), { name: 'Sin usar' });

      await http
        .delete(`/api/v2/categories/${Number(empty.id)}`)
        .set('Authorization', asAna())
        .expect(204);
    });

    it("Beto cannot delete a category of Ana's", async () => {
      const anas = await createCategory(asAna(), { name: 'Privada' });

      await http
        .delete(`/api/v2/categories/${Number(anas.id)}`)
        .set('Authorization', asBeto())
        .expect(404);
    });
  });

  // ── Tags ───────────────────────────────────────────────────────────────────

  describe('Tags', () => {
    it('creating a duplicate tag returns the existing one instead of failing', async () => {
      const first = await http
        .post('/api/v2/tags')
        .set('Authorization', asAna())
        .send({ name: 'reembolsable' })
        .expect(201);

      const second = await http
        .post('/api/v2/tags')
        .set('Authorization', asAna())
        .send({ name: 'reembolsable' })
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
    });

    it('are created on the fly when tagging a transaction', async () => {
      const account = await createAccount(asAna());

      const response = await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '45000',
          type: 'expense',
          tags: ['viaje-cartagena', 'reembolsable'],
        })
        .expect(201);

      expect(response.body.data.tags.sort()).toEqual(['reembolsable', 'viaje-cartagena']);
    });
  });

  // ── Accounts ───────────────────────────────────────────────────────────────

  describe('Accounts', () => {
    it('does not allow deleting an account with transactions: it forces archiving', async () => {
      const account = await createAccount(asAna());
      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '10000',
          type: 'expense',
        })
        .expect(201);

      const response = await http
        .delete(`/api/v2/accounts/${account.id}`)
        .set('Authorization', asAna())
        .expect(409);

      expect(response.body.detail).toMatch(/archív/i);
    });

    it('rejects card fields on an account that is not a credit one', async () => {
      await http
        .post('/api/v2/accounts')
        .set('Authorization', asAna())
        .send({ name: 'Efectivo', type: 'cash', creditLimit: '1000000' })
        .expect(400);
    });
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────

  describe('Dashboard', () => {
    it("the month's cash flow excludes transfers and the spending by category adds up", async () => {
      const account = await createAccount(asAna(), { openingBalance: '0' });
      const other = await createAccount(asAna(), { name: 'Ahorros', type: 'savings' });
      const category = await createCategory(asAna(), { name: 'Mercado' });

      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-05',
          amount: '5200000',
          type: 'income',
        })
        .expect(201);

      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          accountId: Number(account.id),
          date: '2026-08-06',
          amount: '89900',
          type: 'expense',
          categoryId: Number(category.id),
        })
        .expect(201);

      // A transfer that must NOT show up in the cash flow.
      await http
        .post('/api/v2/transactions/transfer')
        .set('Authorization', asAna())
        .send({
          fromAccountId: Number(account.id),
          toAccountId: Number(other.id),
          date: '2026-08-07',
          amount: '1000000',
        })
        .expect(201);

      // The summary is requested by RANGE, not by month: it is the same slice the
      // transactions list uses, so the figures of one explain the other.
      const response = await http
        .get('/api/v2/dashboard?from=2026-08-01&to=2026-08-31')
        .set('Authorization', asAna())
        .expect(200);

      const { range, byCategory, trend, breakdownLevel } = response.body.data;

      expect(range.income).toBe('5200000.00');
      expect(range.expense).toBe('89900.00');
      expect(range.net).toBe('5110100.00');

      // A whole month is grouped by day, and the days with no spending come as
      // zero: leaving them out would make the line join the 3rd and the 20th
      // in a straight line.
      expect(breakdownLevel).toBe('cost_center');
      expect(trend).toHaveLength(31);
      expect(trend.every((p: { bucket: string }) => p.bucket.startsWith('2026-08'))).toBe(true);

      const sumByCategory = byCategory.reduce(
        (total: number, row: { total: string }) => total + Number(row.total),
        0,
      );
      expect(sumByCategory.toFixed(2)).toBe('89900.00');
    });
  });

  // ── Cost centers, groups and concepts ──────────────────────────────────────

  describe('Three-level hierarchy', () => {
    it('filtering by a CENTER brings the transactions of all its concepts', async () => {
      // Costos fijos → Servicios públicos → Celsia
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const group = await createCategory(asAna(), {
        name: 'Servicios públicos',
        parentId: Number(costCenter.id),
      });
      const concept = await createCategory(asAna(), {
        name: 'Celsia (Energia)',
        parentId: Number(group.id),
      });

      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          date: '2026-08-10',
          amount: '200000',
          type: 'expense',
          categoryId: Number(concept.id),
          description: 'Celsia (Energia)',
        })
        .expect(201);

      // The transaction hangs from the CONCEPT. Filtering by the center has to
      // find it all the same, or a breakdown by center would always come out
      // empty.
      for (const id of [costCenter.id, group.id, concept.id]) {
        const r = await http
          .get(`/api/v2/transactions?categoryId=${Number(id)}`)
          .set('Authorization', asAna())
          .expect(200);
        expect(r.body.data).toHaveLength(1);
      }
    });

    it('the search is NOT case-sensitive', async () => {
      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          date: '2026-08-11',
          amount: '150000',
          type: 'expense',
          description: 'Celsia (Energia)',
        })
        .expect(201);

      // Postgres compares case-sensitively, unlike MariaDB. Whoever searches
      // types in lower case and expects to find it.
      const r = await http
        .get('/api/v2/transactions?q=celsia')
        .set('Authorization', asAna())
        .expect(200);

      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0].description).toBe('Celsia (Energia)');
    });

    it('the summary breakdown GOES DOWN a level when filtering', async () => {
      // TWO centers with spending. With only one, the centers level breaks
      // nothing down —"100 % is in the only place it can be"— and the summary
      // skips it, which is what the test below checks.
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const utilities = await createCategory(asAna(), {
        name: 'Servicios públicos',
        parentId: Number(costCenter.id),
      });
      const celsia = await createCategory(asAna(), {
        name: 'Celsia',
        parentId: Number(utilities.id),
      });
      const housing = await createCategory(asAna(), {
        name: 'Vivienda',
        parentId: Number(costCenter.id),
      });
      const rent = await createCategory(asAna(), {
        name: 'Alquiler',
        parentId: Number(housing.id),
      });
      const otherCostCenter = await createCategory(asAna(), { name: 'Costos variables' });

      for (const [id, amount] of [
        [celsia.id, '300000'],
        [rent.id, '900000'],
        [otherCostCenter.id, '50000'],
      ] as const) {
        await http
          .post('/api/v2/transactions')
          .set('Authorization', asAna())
          .send({ date: '2026-08-12', amount, type: 'expense', categoryId: Number(id) })
          .expect(201);
      }

      const unfiltered = await http
        .get('/api/v2/dashboard?from=2026-08-01&to=2026-08-31')
        .set('Authorization', asAna())
        .expect(200);
      expect(unfiltered.body.data.breakdownLevel).toBe('cost_center');
      expect(unfiltered.body.data.byCategory[0].name).toBe('Costos fijos');

      // Fixed against variable, with the names of the centers.
      expect(
        unfiltered.body.data.expenseByCostCenter.map((f: { name: string; total: string }) => [
          f.name,
          f.total,
        ]),
      ).toEqual([
        ['Costos fijos', '1200000.00'],
        ['Costos variables', '50000.00'],
      ]);

      const withinCostCenter = await http
        .get(`/api/v2/dashboard?from=2026-08-01&to=2026-08-31&categoryId=${Number(costCenter.id)}`)
        .set('Authorization', asAna())
        .expect(200);
      expect(withinCostCenter.body.data.breakdownLevel).toBe('category');
      expect(withinCostCenter.body.data.byCategory[0].name).toBe('Vivienda');

      const withinGroup = await http
        .get(`/api/v2/dashboard?from=2026-08-01&to=2026-08-31&categoryId=${Number(utilities.id)}`)
        .set('Authorization', asAna())
        .expect(200);
      expect(withinGroup.body.data.breakdownLevel).toBe('concept');
      expect(withinGroup.body.data.byCategory[0].name).toBe('Celsia');
    });

    it('with a single center with spending, the breakdown skips that level', async () => {
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const utilities = await createCategory(asAna(), {
        name: 'Servicios públicos',
        parentId: Number(costCenter.id),
      });
      const housing = await createCategory(asAna(), {
        name: 'Vivienda',
        parentId: Number(costCenter.id),
      });
      // One more center, WITHOUT spending: existing is not enough to show up in
      // the breakdown.
      await createCategory(asAna(), { name: 'Costos variables' });

      for (const [id, amount] of [
        [utilities.id, '300000'],
        [housing.id, '900000'],
      ] as const) {
        await http
          .post('/api/v2/transactions')
          .set('Authorization', asAna())
          .send({ date: '2026-08-12', amount, type: 'expense', categoryId: Number(id) })
          .expect(201);
      }

      const r = await http
        .get('/api/v2/dashboard?from=2026-08-01&to=2026-08-31')
        .set('Authorization', asAna())
        .expect(200);

      // The GROUPS of the only center with spending are shown, and the center's
      // name becomes the subtitle. Showing "Costos fijos, 100 %" answers
      // nothing: that was known before looking.
      expect(r.body.data.breakdownLevel).toBe('category');
      expect(r.body.data.breakdownParent.name).toBe('Costos fijos');
      expect(r.body.data.byCategory.map((f: { name: string }) => f.name)).toEqual([
        'Vivienda',
        'Servicios públicos',
      ]);

      // The fixed/variable split does NOT go down with the breakdown: even when
      // the donut shows groups, this question is answered at the centers.
      expect(r.body.data.expenseByCostCenter).toHaveLength(1);
      expect(r.body.data.expenseByCostCenter[0].name).toBe('Costos fijos');
      expect(r.body.data.expenseByCostCenter[0].total).toBe('1200000.00');
    });

    it("the month's budget adds up the recurring ones, paid or not", async () => {
      // The CURRENT month, computed the same way as the API. A fixed date would
      // stop working next month: the budget always looks at today.
      const today = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const month = today.toISOString().slice(0, 7);
      const dayOf = (monthsAgo: number) =>
        new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsAgo, 10))
          .toISOString()
          .slice(0, 10);

      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const rent = await createCategory(asAna(), {
        name: 'Alquiler',
        parentId: Number(costCenter.id),
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 15,
      });
      const water = await createCategory(asAna(), {
        name: 'Agua',
        parentId: Number(costCenter.id),
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 10,
      });
      // Not marked: an expense that does not come back is not budget.
      const groceries = await createCategory(asAna(), {
        name: 'Mercado',
        parentId: Number(costCenter.id),
      });

      const expense = async (categoryId: unknown, date: string, amount: string) => {
        await http
          .post('/api/v2/transactions')
          .set('Authorization', asAna())
          .send({ date, amount, type: 'expense', categoryId: Number(categoryId) })
          .expect(201);
      };

      // The history is where what is EXPECTED to be paid comes from: the average
      // of the months with a payment within the previous three.
      await expense(rent.id, dayOf(1), '1000000');
      await expense(water.id, dayOf(2), '100000');
      await expense(water.id, dayOf(1), '140000');
      // This month: the rent is already paid, and dearer than last time.
      await expense(rent.id, `${month}-01`, '1100000');
      await expense(groceries.id, `${month}-01`, '80000');

      const r = await http
        .get(`/api/v2/dashboard?from=${month}-01&to=${month}-28`)
        .set('Authorization', asAna())
        .expect(200);

      // 1.100.000 of PAID rent —for what it really cost, not what it used to
      // cost— plus 120.000 of water, which is missing and estimated by averaging
      // its two months: (100.000 + 140.000) / 2. Groceries do not count: they are
      // not recurring.
      expect(r.body.data.requiredBudget).toBe('1220000.00');

      // And what is missing is only the water. The budget does not shrink on
      // payment —that is the difference between the two figures—, the pending
      // list does.
      expect(r.body.data.pending).toHaveLength(1);
      expect(r.body.data.pending[0].name).toBe('Agua');
      expect(r.body.data.pending[0].expectedAmount).toBe('120000.00');
    });

    it('an UNCONFIRMED transaction does not take the concept off the pending list', async () => {
      const today = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const month = today.toISOString().slice(0, 7);

      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const water = await createCategory(asAna(), {
        name: 'Agua',
        parentId: Number(costCenter.id),
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 10,
      });

      // A payment announced but not confirmed: a scheduled transfer, a debit
      // that does not show on the statement yet.
      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          date: `${month}-01`,
          amount: '120000',
          type: 'expense',
          categoryId: Number(water.id),
          status: 'pending',
        })
        .expect(201);

      const r = await http
        .get(`/api/v2/dashboard?from=${month}-01&to=${month}-28`)
        .set('Authorization', asAna())
        .expect(200);

      // Still pending: a pending payment is what is in the budget and does NOT
      // yet have a confirmed transaction behind it. Taking it off the list would
      // promise that something is settled when it is not.
      expect(r.body.data.pending).toHaveLength(1);
      expect(r.body.data.pending[0].name).toBe('Agua');
    });

    it('an ARCHIVED concept leaves the pending list but still counts in the history', async () => {
      /*
        Archiving looks forward: the gym that was cancelled is not asked for
        again every month. But it does not rewrite what already happened:
        what it cost while it was alive stays in the total spent and in the
        donut.

        Both halves are checked in ONE response —the range covers last month
        and this one— because the pending ones always come from the current
        month, while the totals come from the requested range. If the
        archived filter moved to the query both of them drink from, this
        test would say so: the total would lose the 90.000.
      */
      const today = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const month = today.toISOString().slice(0, 7);
      const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 10))
        .toISOString()
        .slice(0, 7);

      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      // The water is left alone: it is the witness that the list is still alive.
      await createCategory(asAna(), {
        name: 'Agua',
        parentId: Number(costCenter.id),
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 10,
      });
      const gym = await createCategory(asAna(), {
        name: 'Gimnasio',
        parentId: Number(costCenter.id),
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 5,
      });

      // The gym was paid last month; this month neither of them.
      await http
        .post('/api/v2/transactions')
        .set('Authorization', asAna())
        .send({
          date: `${lastMonth}-05`,
          amount: '90000',
          type: 'expense',
          categoryId: Number(gym.id),
        })
        .expect(201);

      // And then it is cancelled: archived, not deleted.
      await http
        .patch(`/api/v2/categories/${gym.id}`)
        .set('Authorization', asAna())
        .send({ isArchived: true })
        .expect(200);

      const r = await http
        .get(`/api/v2/dashboard?from=${lastMonth}-01&to=${month}-28`)
        .set('Authorization', asAna())
        .expect(200);

      // Both unpaid this month, but only the water is asked for: the archived
      // gym is no longer something left to pay, nor does it enter the budget.
      expect(r.body.data.pending.map((p: { name: string }) => p.name)).toEqual(['Agua']);
      expect(r.body.data.requiredBudget).toBe('0.00');

      // What it cost while it was alive is still there: in the total and in the donut.
      expect(r.body.data.range.expense).toBe('90000.00');
      const byCategoryRows = r.body.data.byCategory as { categoryId: unknown; total: string }[];
      expect(byCategoryRows.map((row) => Number(row.total)).reduce((a, b) => a + b, 0)).toBe(90000);
    });
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  describe('Pagination', () => {
    it('returns meta.total and does not overlap rows between pages', async () => {
      const account = await createAccount(asAna());

      for (let i = 1; i <= 5; i += 1) {
        await http
          .post('/api/v2/transactions')
          .set('Authorization', asAna())
          .send({
            accountId: Number(account.id),
            date: `2026-08-${String(i).padStart(2, '0')}`,
            amount: `${i}0000`,
            type: 'expense',
          })
          .expect(201);
      }

      const page1 = await http
        .get('/api/v2/transactions?page=1&perPage=2')
        .set('Authorization', asAna())
        .expect(200);

      const page2 = await http
        .get('/api/v2/transactions?page=2&perPage=2')
        .set('Authorization', asAna())
        .expect(200);

      expect(page1.body.meta.total).toBe(5);
      expect(page1.body.data).toHaveLength(2);

      const ids1 = page1.body.data.map((row: { id: number }) => row.id);
      const ids2 = page2.body.data.map((row: { id: number }) => row.id);
      expect(ids1.filter((id: number) => ids2.includes(id))).toHaveLength(0);
    });
  });
});
