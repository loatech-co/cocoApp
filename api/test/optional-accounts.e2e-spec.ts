import request from 'supertest';

import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Optional accounts.
 *
 * The product decision: tracking accounts —cards, savings, cash— is a feature
 * switched on in the settings, not a requirement for recording an expense.
 * Nobody should have to make up an account before they can note down their
 * first coffee.
 *
 * What is protected here is that the promise really holds along the whole
 * chain: creating, listing, and the balances of whoever DOES track accounts.
 */
describe('Optional accounts (e2e)', () => {
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

  const expense = (body: Record<string, unknown> = {}) =>
    http
      .post('/api/v2/transactions')
      .set('Authorization', asAna)
      .send({ date: '2026-08-01', amount: '45900.50', type: 'expense', ...body });

  // ── Preferences ────────────────────────────────────────────────────────────

  describe('The preference', () => {
    it('is born OFF: recording an expense does not require making up an account', async () => {
      const response = await http
        .get('/api/v2/preferences')
        .set('Authorization', asAna)
        .expect(200);

      expect(response.body.data).toEqual({ accountsEnabled: false });
    });

    it('can be switched on and stays saved', async () => {
      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asAna)
        .send({ accountsEnabled: true })
        .expect(200);

      const response = await http
        .get('/api/v2/preferences')
        .set('Authorization', asAna)
        .expect(200);
      expect(response.body.data.accountsEnabled).toBe(true);
    });

    it('switching it on twice duplicates nothing', async () => {
      // The upsert goes against the unique index (user_id, pref_key): it is idempotent.
      for (let i = 0; i < 3; i += 1) {
        await http
          .patch('/api/v2/preferences')
          .set('Authorization', asAna)
          .send({ accountsEnabled: true })
          .expect(200);
      }
      expect(await env.prisma.userPreference.count({ where: { userId: ana.id } })).toBe(1);
    });

    it('rejects a preference that is not in the catalogue', async () => {
      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asAna)
        .send({ madeUp: true })
        .expect(400);
    });

    it('rejects a value that is not a boolean', async () => {
      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asAna)
        .send({ accountsEnabled: 'si' })
        .expect(400);
    });

    it("another person's preferences are not visible", async () => {
      const beto = await env.createUser();
      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asAna)
        .send({ accountsEnabled: true })
        .expect(200);

      const response = await http
        .get('/api/v2/preferences')
        .set('Authorization', env.as(beto))
        .expect(200);
      expect(response.body.data.accountsEnabled).toBe(false);
    });

    // ── The key: `accounts_enabled` since 7.2-r1, `cuentas_habilitadas` before ──

    const storedKeys = async () =>
      (
        await env.prisma.userPreference.findMany({
          where: { userId: ana.id },
          select: { prefKey: true, prefValue: true },
          orderBy: { prefKey: 'asc' },
        })
      ).map((row) => [row.prefKey, row.prefValue]);

    it('saves the switch under the English key', async () => {
      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asAna)
        .send({ accountsEnabled: true })
        .expect(200);

      expect(await storedKeys()).toEqual([['accounts_enabled', true]]);
    });

    it('reads a switch saved under the legacy Spanish key', async () => {
      await env.prisma.userPreference.create({
        data: { userId: ana.id, prefKey: 'cuentas_habilitadas', prefValue: true },
      });

      const response = await http
        .get('/api/v2/preferences')
        .set('Authorization', asAna)
        .expect(200);
      expect(response.body.data).toEqual({ accountsEnabled: true });
    });

    it('a change over a legacy row writes the English key, and that one wins', async () => {
      await env.prisma.userPreference.create({
        data: { userId: ana.id, prefKey: 'cuentas_habilitadas', prefValue: true },
      });

      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asAna)
        .send({ accountsEnabled: false })
        .expect(200);

      const response = await http
        .get('/api/v2/preferences')
        .set('Authorization', asAna)
        .expect(200);
      expect(response.body.data.accountsEnabled).toBe(false);
      // The legacy row is left as it was: rewriting the leftovers is the 7.10 contract.
      expect(await storedKeys()).toEqual([
        ['accounts_enabled', false],
        ['cuentas_habilitadas', true],
      ]);
    });
  });

  // ── The case that started it all ───────────────────────────────────────────

  describe('Recording an expense without an account', () => {
    it('works, and is the default path', async () => {
      const response = await expense({ description: 'Café' }).expect(201);

      expect(response.body.data).toMatchObject({
        accountId: null,
        amount: '45900.50',
        description: 'Café',
      });
    });

    it('shows up in the list like any other', async () => {
      await expense({ description: 'Café' }).expect(201);

      const response = await http
        .get('/api/v2/transactions')
        .set('Authorization', asAna)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].accountId).toBeNull();
    });

    it('keeps the cents, account or no account', async () => {
      const response = await expense({ amount: '0.01' }).expect(201);
      expect(response.body.data.amount).toBe('0.01');
    });

    it('can be categorised all the same', async () => {
      const category = await http
        .post('/api/v2/categories')
        .set('Authorization', asAna)
        .send({ name: 'Mercado', kind: 'expense' })
        .expect(201);

      const response = await expense({ categoryId: category.body.data.id }).expect(201);
      expect(response.body.data.categoryId).toBe(category.body.data.id);
    });

    it('the dashboard works without a single account', async () => {
      await expense().expect(201);
      await http.get('/api/v2/dashboard').set('Authorization', asAna).expect(200);
    });
  });

  // ── Convivencia ────────────────────────────────────────────────────────────

  describe('Whoever DOES track accounts', () => {
    const createAccount = () =>
      http
        .post('/api/v2/accounts')
        .set('Authorization', asAna)
        .send({ name: 'Bancolombia', type: 'debit', openingBalance: '500000' })
        .expect(201);

    it('the balance IGNORES transactions without an account', async () => {
      // It is the consequence to face head on: an expense that belongs to no
      // account cannot change the balance of any.
      const account = await createAccount();

      await expense({ accountId: account.body.data.id, amount: '100000.00' }).expect(201);
      await expense({ amount: '999999.00' }).expect(201); // no account

      const accounts = await http.get('/api/v2/accounts').set('Authorization', asAna).expect(200);

      // 500000 − 100000, with no trace of the 999999.
      expect(accounts.body.data[0].balance).toBe('400000.00');
    });

    it('both kinds of transaction live together in the same list', async () => {
      const account = await createAccount();
      await expense({ accountId: account.body.data.id }).expect(201);
      await expense().expect(201);

      const response = await http
        .get('/api/v2/transactions')
        .set('Authorization', asAna)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      const withAccount = response.body.data.filter(
        (m: { accountId: number | null }) => m.accountId !== null,
      );
      expect(withAccount).toHaveLength(1);
    });

    it('an account can be assigned later, to the transaction that had none', async () => {
      const account = await createAccount();
      const transaction = await expense({ amount: '100000.00' }).expect(201);

      await http
        .patch(`/api/v2/transactions/${transaction.body.data.id}`)
        .set('Authorization', asAna)
        .send({ accountId: account.body.data.id })
        .expect(200);

      const accounts = await http.get('/api/v2/accounts').set('Authorization', asAna).expect(200);
      expect(accounts.body.data[0].balance).toBe('400000.00');
    });

    it("still rejects someone else's account, with 422", async () => {
      const beto = await env.createUser();
      const own = await http
        .post('/api/v2/accounts')
        .set('Authorization', env.as(beto))
        .send({ name: 'Suya', type: 'debit', openingBalance: '0' })
        .expect(201);

      await expense({ accountId: own.body.data.id }).expect(422);
    });
  });
});
