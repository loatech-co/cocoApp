import request from 'supertest';

import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

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
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let ana: UsuarioDePrueba;
  let comoAna: string;

  beforeAll(async () => {
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  beforeEach(async () => {
    await entorno.limpiar();
    ana = await entorno.crearUsuario({ displayName: 'Ana' });
    comoAna = entorno.como(ana);
  });

  const gasto = (body: Record<string, unknown> = {}) =>
    http
      .post('/api/v1/transactions')
      .set('Authorization', comoAna)
      .send({ date: '2026-08-01', amount: '45900.50', type: 'expense', ...body });

  // ── Preferencias ───────────────────────────────────────────────────────────

  describe('La preferencia', () => {
    it('nace APAGADA: registrar un gasto no exige inventarse una cuenta', async () => {
      const respuesta = await http
        .get('/api/v1/preferences')
        .set('Authorization', comoAna)
        .expect(200);

      expect(respuesta.body.data).toEqual({ cuentas_habilitadas: false });
    });

    it('se puede encender y queda guardada', async () => {
      await http
        .patch('/api/v1/preferences')
        .set('Authorization', comoAna)
        .send({ cuentas_habilitadas: true })
        .expect(200);

      const respuesta = await http
        .get('/api/v1/preferences')
        .set('Authorization', comoAna)
        .expect(200);
      expect(respuesta.body.data.cuentas_habilitadas).toBe(true);
    });

    it('encenderla dos veces no duplica nada', async () => {
      // El upsert va contra el índice único (user_id, pref_key): es idempotente.
      for (let i = 0; i < 3; i += 1) {
        await http
          .patch('/api/v1/preferences')
          .set('Authorization', comoAna)
          .send({ cuentas_habilitadas: true })
          .expect(200);
      }
      expect(await entorno.prisma.userPreference.count({ where: { userId: ana.id } })).toBe(1);
    });

    it('rechaza una preferencia que no existe en el catálogo', async () => {
      await http
        .patch('/api/v1/preferences')
        .set('Authorization', comoAna)
        .send({ inventada: true })
        .expect(400);
    });

    it('rechaza un valor que no es booleano', async () => {
      await http
        .patch('/api/v1/preferences')
        .set('Authorization', comoAna)
        .send({ cuentas_habilitadas: 'si' })
        .expect(400);
    });

    it('las preferencias de otra persona no se ven', async () => {
      const beto = await entorno.crearUsuario();
      await http
        .patch('/api/v1/preferences')
        .set('Authorization', comoAna)
        .send({ cuentas_habilitadas: true })
        .expect(200);

      const respuesta = await http
        .get('/api/v1/preferences')
        .set('Authorization', entorno.como(beto))
        .expect(200);
      expect(respuesta.body.data.cuentas_habilitadas).toBe(false);
    });
  });

  // ── El caso que motivó todo ────────────────────────────────────────────────

  describe('Registrar un gasto sin cuenta', () => {
    it('funciona, y es el camino por defecto', async () => {
      const respuesta = await gasto({ description: 'Café' }).expect(201);

      expect(respuesta.body.data).toMatchObject({
        account_id: null,
        amount: '45900.50',
        description: 'Café',
      });
    });

    it('aparece en el listado como cualquier otro', async () => {
      await gasto({ description: 'Café' }).expect(201);

      const respuesta = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoAna)
        .expect(200);

      expect(respuesta.body.data).toHaveLength(1);
      expect(respuesta.body.data[0].account_id).toBeNull();
    });

    it('respeta los centavos, cuenta o no cuenta', async () => {
      const respuesta = await gasto({ amount: '0.01' }).expect(201);
      expect(respuesta.body.data.amount).toBe('0.01');
    });

    it('se puede categorizar igual', async () => {
      const categoria = await http
        .post('/api/v1/categories')
        .set('Authorization', comoAna)
        .send({ name: 'Mercado', kind: 'expense' })
        .expect(201);

      const respuesta = await gasto({ category_id: categoria.body.data.id }).expect(201);
      expect(respuesta.body.data.category_id).toBe(categoria.body.data.id);
    });

    it('el dashboard funciona sin una sola cuenta', async () => {
      await gasto().expect(201);
      await http.get('/api/v1/dashboard').set('Authorization', comoAna).expect(200);
    });
  });

  // ── Convivencia ────────────────────────────────────────────────────────────

  describe('Quien SÍ lleva cuentas', () => {
    const crearCuenta = () =>
      http
        .post('/api/v1/accounts')
        .set('Authorization', comoAna)
        .send({ name: 'Bancolombia', type: 'debit', opening_balance: '500000' })
        .expect(201);

    it('el saldo IGNORA los movimientos sin cuenta', async () => {
      // Es la consecuencia que hay que asumir de frente: un gasto que no
      // pertenece a ninguna cuenta no puede alterar el saldo de ninguna.
      const cuenta = await crearCuenta();

      await gasto({ account_id: cuenta.body.data.id, amount: '100000.00' }).expect(201);
      await gasto({ amount: '999999.00' }).expect(201); // sin cuenta

      const cuentas = await http.get('/api/v1/accounts').set('Authorization', comoAna).expect(200);

      // 500000 − 100000, sin rastro de los 999999.
      expect(cuentas.body.data[0].balance).toBe('400000.00');
    });

    it('los dos tipos de movimiento conviven en el mismo listado', async () => {
      const cuenta = await crearCuenta();
      await gasto({ account_id: cuenta.body.data.id }).expect(201);
      await gasto().expect(201);

      const respuesta = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoAna)
        .expect(200);

      expect(respuesta.body.data).toHaveLength(2);
      const conCuenta = respuesta.body.data.filter(
        (m: { account_id: number | null }) => m.account_id !== null,
      );
      expect(conCuenta).toHaveLength(1);
    });

    it('se puede asignar una cuenta después, al movimiento que no la tenía', async () => {
      const cuenta = await crearCuenta();
      const movimiento = await gasto({ amount: '100000.00' }).expect(201);

      await http
        .patch(`/api/v1/transactions/${movimiento.body.data.id}`)
        .set('Authorization', comoAna)
        .send({ account_id: cuenta.body.data.id })
        .expect(200);

      const cuentas = await http.get('/api/v1/accounts').set('Authorization', comoAna).expect(200);
      expect(cuentas.body.data[0].balance).toBe('400000.00');
    });

    it('sigue rechazando una cuenta ajena, con 422', async () => {
      const beto = await entorno.crearUsuario();
      const suya = await http
        .post('/api/v1/accounts')
        .set('Authorization', entorno.como(beto))
        .send({ name: 'Suya', type: 'debit', opening_balance: '0' })
        .expect(201);

      await gasto({ account_id: suya.body.data.id }).expect(422);
    });
  });
});
