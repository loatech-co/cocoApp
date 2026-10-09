import request from 'supertest';

import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Cuentas opcionales.
 *
 * La decisión de producto: llevar cuentas —tarjetas, ahorros, efectivo— es una
 * función que se enciende en los ajustes, no un requisito para registrar un
 * gasto. Nadie debería tener que inventarse una cuenta antes de poder anotar
 * el primer café.
 *
 * Lo que se protege aquí es que esa promesa se cumpla de verdad en toda la
 * cadena: crear, listar, y los saldos de quien SÍ lleva cuentas.
 */
describe('Cuentas opcionales (e2e)', () => {
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

  // ── Preferencias ───────────────────────────────────────────────────────────

  describe('La preferencia', () => {
    it('nace APAGADA: registrar un gasto no exige inventarse una cuenta', async () => {
      const response = await http
        .get('/api/v2/preferences')
        .set('Authorization', asAna)
        .expect(200);

      expect(response.body.data).toEqual({ accountsEnabled: false });
    });

    it('se puede encender y queda guardada', async () => {
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

    it('encenderla dos veces no duplica nada', async () => {
      // El upsert va contra el índice único (user_id, pref_key): es idempotente.
      for (let i = 0; i < 3; i += 1) {
        await http
          .patch('/api/v2/preferences')
          .set('Authorization', asAna)
          .send({ accountsEnabled: true })
          .expect(200);
      }
      expect(await env.prisma.userPreference.count({ where: { userId: ana.id } })).toBe(1);
    });

    it('rechaza una preferencia que no existe en el catálogo', async () => {
      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asAna)
        .send({ madeUp: true })
        .expect(400);
    });

    it('rechaza un valor que no es booleano', async () => {
      await http
        .patch('/api/v2/preferences')
        .set('Authorization', asAna)
        .send({ accountsEnabled: 'si' })
        .expect(400);
    });

    it('las preferencias de otra persona no se ven', async () => {
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
  });

  // ── El caso que motivó todo ────────────────────────────────────────────────

  describe('Registrar un gasto sin cuenta', () => {
    it('funciona, y es el camino por defecto', async () => {
      const response = await expense({ description: 'Café' }).expect(201);

      expect(response.body.data).toMatchObject({
        accountId: null,
        amount: '45900.50',
        description: 'Café',
      });
    });

    it('aparece en el listado como cualquier otro', async () => {
      await expense({ description: 'Café' }).expect(201);

      const response = await http
        .get('/api/v2/transactions')
        .set('Authorization', asAna)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].accountId).toBeNull();
    });

    it('respeta los centavos, cuenta o no cuenta', async () => {
      const response = await expense({ amount: '0.01' }).expect(201);
      expect(response.body.data.amount).toBe('0.01');
    });

    it('se puede categorizar igual', async () => {
      const category = await http
        .post('/api/v2/categories')
        .set('Authorization', asAna)
        .send({ name: 'Mercado', kind: 'expense' })
        .expect(201);

      const response = await expense({ categoryId: category.body.data.id }).expect(201);
      expect(response.body.data.categoryId).toBe(category.body.data.id);
    });

    it('el dashboard funciona sin una sola cuenta', async () => {
      await expense().expect(201);
      await http.get('/api/v2/dashboard').set('Authorization', asAna).expect(200);
    });
  });

  // ── Convivencia ────────────────────────────────────────────────────────────

  describe('Quien SÍ lleva cuentas', () => {
    const createAccount = () =>
      http
        .post('/api/v2/accounts')
        .set('Authorization', asAna)
        .send({ name: 'Bancolombia', type: 'debit', openingBalance: '500000' })
        .expect(201);

    it('el saldo IGNORA los movimientos sin cuenta', async () => {
      // Es la consecuencia que hay que asumir de frente: un gasto que no
      // pertenece a ninguna cuenta no puede alterar el saldo de ninguna.
      const account = await createAccount();

      await expense({ accountId: account.body.data.id, amount: '100000.00' }).expect(201);
      await expense({ amount: '999999.00' }).expect(201); // sin cuenta

      const accounts = await http.get('/api/v2/accounts').set('Authorization', asAna).expect(200);

      // 500000 − 100000, sin rastro de los 999999.
      expect(accounts.body.data[0].balance).toBe('400000.00');
    });

    it('los dos tipos de movimiento conviven en el mismo listado', async () => {
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

    it('se puede asignar una cuenta después, al movimiento que no la tenía', async () => {
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

    it('sigue rechazando una cuenta ajena, con 422', async () => {
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
