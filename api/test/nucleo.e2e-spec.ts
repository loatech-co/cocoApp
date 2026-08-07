import request from 'supertest';
import { levantarApp, type EntornoDePruebas } from './helpers/app';

/**
 * Fase 1 — el núcleo, contra MariaDB real.
 *
 * Lo que se protege aquí es lo que el PRD exige antes de avanzar de fase: que
 * los saldos se deriven bien, que los splits no cuadrados se rechacen, y que
 * ningún usuario pueda ver ni tocar los datos de otro.
 */
describe('Fase 1 — Núcleo (e2e)', () => {
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;

  const ANA = 'e2e-ana';
  const BETO = 'e2e-beto';

  const comoAna = (): string => entorno.como(ANA);
  const comoBeto = (): string => entorno.como(BETO);

  beforeAll(async () => {
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  beforeEach(async () => {
    await entorno.limpiar();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const crearCuenta = async (auth: string, body: Record<string, unknown> = {}) => {
    const respuesta = await http
      .post('/api/v1/accounts')
      .set('Authorization', auth)
      .send({ name: 'Bancolombia', type: 'debit', opening_balance: '0', ...body })
      .expect(201);
    return respuesta.body.data;
  };

  const crearCategoria = async (auth: string, body: Record<string, unknown> = {}) => {
    const respuesta = await http
      .post('/api/v1/categories')
      .set('Authorization', auth)
      .send({ name: 'Mercado', kind: 'expense', ...body })
      .expect(201);
    return respuesta.body.data;
  };

  // ── Saldos derivados ───────────────────────────────────────────────────────

  describe('Saldos derivados', () => {
    it('el saldo cuadra al centavo con la suma de los movimientos', async () => {
      const cuenta = await crearCuenta(comoAna(), { opening_balance: '500000' });

      for (const movimiento of [
        { amount: '1000000', type: 'income' },
        { amount: '300000', type: 'expense' },
      ]) {
        await http
          .post('/api/v1/transactions')
          .set('Authorization', comoAna())
          .send({ account_id: Number(cuenta.id), date: '2026-08-05', ...movimiento })
          .expect(201);
      }

      const respuesta = await http
        .get(`/api/v1/accounts/${cuenta.id}`)
        .set('Authorization', comoAna())
        .expect(200);

      expect(respuesta.body.data.balance).toBe('1200000.00');
    });

    it('un movimiento pending no altera el saldo confirmado, pero sí el proyectado', async () => {
      const cuenta = await crearCuenta(comoAna(), { opening_balance: '100000' });

      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '50000',
          type: 'expense',
          status: 'pending',
        })
        .expect(201);

      const respuesta = await http
        .get(`/api/v1/accounts/${cuenta.id}`)
        .set('Authorization', comoAna())
        .expect(200);

      expect(respuesta.body.data.balance).toBe('100000.00');
      expect(respuesta.body.data.balance_projected).toBe('50000.00');
    });

    it('en una tarjeta de crédito el consumo aumenta la deuda y baja el cupo', async () => {
      const tarjeta = await crearCuenta(comoAna(), {
        name: 'Visa',
        type: 'credit',
        credit_limit: '5000000',
        opening_balance: '0',
      });

      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(tarjeta.id),
          date: '2026-08-05',
          amount: '1240000',
          type: 'expense',
        })
        .expect(201);

      const respuesta = await http
        .get(`/api/v1/accounts/${tarjeta.id}`)
        .set('Authorization', comoAna())
        .expect(200);

      expect(respuesta.body.data.balance).toBe('1240000.00');
      expect(respuesta.body.data.available_credit).toBe('3760000.00');
    });
  });

  // ── Splits ─────────────────────────────────────────────────────────────────

  describe('Splits', () => {
    it('acepta un movimiento cuyos splits cuadran exactamente', async () => {
      const cuenta = await crearCuenta(comoAna());
      const mercado = await crearCategoria(comoAna(), { name: 'Mercado' });
      const aseo = await crearCategoria(comoAna(), { name: 'Aseo' });

      const respuesta = await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '150000',
          type: 'expense',
          splits: [
            { category_id: Number(mercado.id), amount: '105000', note: 'Mercado' },
            { category_id: Number(aseo.id), amount: '45000', note: 'Aseo' },
          ],
        })
        .expect(201);

      expect(respuesta.body.data.splits).toHaveLength(2);
    });

    it('rechaza con 422 si los splits no suman el monto, y no persiste nada', async () => {
      const cuenta = await crearCuenta(comoAna());

      const respuesta = await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '150000',
          type: 'expense',
          splits: [{ amount: '105000' }, { amount: '45000.01' }],
        })
        .expect(422);

      expect(respuesta.body.error.message).toMatch(/no coincide/i);

      // El ROLLBACK debe haber dejado la base intacta.
      const listado = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoAna())
        .expect(200);
      expect(listado.body.meta.total).toBe(0);
    });
  });

  // ── Transferencias ─────────────────────────────────────────────────────────

  describe('Transferencias', () => {
    it('crea dos patas emparejadas y no altera el patrimonio total', async () => {
      const origen = await crearCuenta(comoAna(), { name: 'Ahorros', opening_balance: '1000000' });
      const destino = await crearCuenta(comoAna(), { name: 'Efectivo', type: 'cash' });

      const respuesta = await http
        .post('/api/v1/transactions/transfer')
        .set('Authorization', comoAna())
        .send({
          from_account_id: Number(origen.id),
          to_account_id: Number(destino.id),
          date: '2026-08-05',
          amount: '300000',
        })
        .expect(201);

      expect(respuesta.body.data.legs).toHaveLength(2);

      const cuentas = await http
        .get('/api/v1/accounts')
        .set('Authorization', comoAna())
        .expect(200);

      const saldos = Object.fromEntries(
        cuentas.body.data.map((cuenta: { name: string; balance: string }) => [
          cuenta.name,
          cuenta.balance,
        ]),
      );

      expect(saldos['Ahorros']).toBe('700000.00');
      expect(saldos['Efectivo']).toBe('300000.00');
    });

    it('rechaza una transferencia a la misma cuenta', async () => {
      const cuenta = await crearCuenta(comoAna());

      await http
        .post('/api/v1/transactions/transfer')
        .set('Authorization', comoAna())
        .send({
          from_account_id: Number(cuenta.id),
          to_account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '100000',
        })
        .expect(422);
    });

    it('borrar una pata borra la otra: nunca queda una transferencia coja', async () => {
      const origen = await crearCuenta(comoAna(), { name: 'A', opening_balance: '500000' });
      const destino = await crearCuenta(comoAna(), { name: 'B', type: 'cash' });

      const transferencia = await http
        .post('/api/v1/transactions/transfer')
        .set('Authorization', comoAna())
        .send({
          from_account_id: Number(origen.id),
          to_account_id: Number(destino.id),
          date: '2026-08-05',
          amount: '200000',
        })
        .expect(201);

      const primeraPata = transferencia.body.data.legs[0];

      await http
        .delete(`/api/v1/transactions/${primeraPata.id}`)
        .set('Authorization', comoAna())
        .expect(204);

      const listado = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoAna())
        .expect(200);

      expect(listado.body.meta.total).toBe(0);
    });
  });

  // ── No-rigidez ─────────────────────────────────────────────────────────────

  describe('No-rigidez', () => {
    it('guarda un movimiento SIN categoría sin protestar', async () => {
      const cuenta = await crearCuenta(comoAna());

      const respuesta = await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '32000',
          type: 'expense',
        })
        .expect(201);

      expect(respuesta.body.data.category_id).toBeNull();
    });

    it('permite exceder el cupo de la tarjeta: informa, no bloquea', async () => {
      const tarjeta = await crearCuenta(comoAna(), {
        name: 'Visa',
        type: 'credit',
        credit_limit: '1000000',
      });

      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(tarjeta.id),
          date: '2026-08-05',
          amount: '1150000',
          type: 'expense',
        })
        .expect(201);

      const respuesta = await http
        .get(`/api/v1/accounts/${tarjeta.id}`)
        .set('Authorization', comoAna())
        .expect(200);

      expect(respuesta.body.data.available_credit).toBe('-150000.00');
    });
  });

  // ── Autorización por propiedad ─────────────────────────────────────────────

  describe('Scoping por usuario', () => {
    it('Beto no ve los movimientos de Ana', async () => {
      const cuenta = await crearCuenta(comoAna());
      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '50000',
          type: 'expense',
        })
        .expect(201);

      const listado = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoBeto())
        .expect(200);

      expect(listado.body.meta.total).toBe(0);
    });

    it('pedir una cuenta ajena por id responde 404, no 403: no confirma que exista', async () => {
      const cuenta = await crearCuenta(comoAna());

      await http
        .get(`/api/v1/accounts/${cuenta.id}`)
        .set('Authorization', comoBeto())
        .expect(404);
    });

    it('Beto no puede editar una cuenta de Ana', async () => {
      const cuenta = await crearCuenta(comoAna());

      await http
        .patch(`/api/v1/accounts/${cuenta.id}`)
        .set('Authorization', comoBeto())
        .send({ name: 'Secuestrada' })
        .expect(404);
    });

    it('Beto no puede crear un movimiento contra la cuenta de Ana', async () => {
      const cuenta = await crearCuenta(comoAna());

      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoBeto())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '50000',
          type: 'expense',
        })
        .expect(422);
    });

    it('enviar user_id en el body no cambia el propietario: lo rechaza el pipe', async () => {
      const cuenta = await crearCuenta(comoAna());

      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '50000',
          type: 'expense',
          user_id: 99999,
        })
        .expect(400);
    });
  });

  // ── Categorías ─────────────────────────────────────────────────────────────

  describe('Categorías', () => {
    it('rechaza con 422 un ciclo en el árbol', async () => {
      const padre = await crearCategoria(comoAna(), { name: 'Hogar' });
      const hijo = await crearCategoria(comoAna(), {
        name: 'Servicios',
        parent_id: Number(padre.id),
      });

      await http
        .patch(`/api/v1/categories/${padre.id}`)
        .set('Authorization', comoAna())
        .send({ parent_id: Number(hijo.id) })
        .expect(422);
    });

    it('devuelve el árbol anidado, no una lista plana', async () => {
      const padre = await crearCategoria(comoAna(), { name: 'Hogar' });
      await crearCategoria(comoAna(), { name: 'Servicios', parent_id: Number(padre.id) });

      const respuesta = await http
        .get('/api/v1/categories')
        .set('Authorization', comoAna())
        .expect(200);

      expect(respuesta.body.data).toHaveLength(1);
      expect(respuesta.body.data[0].children).toHaveLength(1);
      expect(respuesta.body.data[0].children[0].name).toBe('Servicios');
    });

    it('siembra el diccionario inicial y luego se niega a repetirlo', async () => {
      const primera = await http
        .post('/api/v1/categories/seed')
        .set('Authorization', comoAna())
        .expect(201);

      expect(primera.body.data.creadas).toBeGreaterThan(40);

      await http.post('/api/v1/categories/seed').set('Authorization', comoAna()).expect(409);
    });
  });

  // ── Etiquetas ──────────────────────────────────────────────────────────────

  describe('Etiquetas', () => {
    it('crear una etiqueta repetida devuelve la existente en vez de fallar', async () => {
      const primera = await http
        .post('/api/v1/tags')
        .set('Authorization', comoAna())
        .send({ name: 'reembolsable' })
        .expect(201);

      const segunda = await http
        .post('/api/v1/tags')
        .set('Authorization', comoAna())
        .send({ name: 'reembolsable' })
        .expect(201);

      expect(segunda.body.data.id).toBe(primera.body.data.id);
    });

    it('se crean al vuelo al etiquetar un movimiento', async () => {
      const cuenta = await crearCuenta(comoAna());

      const respuesta = await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '45000',
          type: 'expense',
          tags: ['viaje-cartagena', 'reembolsable'],
        })
        .expect(201);

      expect(respuesta.body.data.tags.sort()).toEqual(['reembolsable', 'viaje-cartagena']);
    });
  });

  // ── Cuentas ────────────────────────────────────────────────────────────────

  describe('Cuentas', () => {
    it('no deja borrar una cuenta con movimientos: obliga a archivar', async () => {
      const cuenta = await crearCuenta(comoAna());
      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '10000',
          type: 'expense',
        })
        .expect(201);

      const respuesta = await http
        .delete(`/api/v1/accounts/${cuenta.id}`)
        .set('Authorization', comoAna())
        .expect(409);

      expect(respuesta.body.error.message).toMatch(/archív/i);
    });

    it('rechaza campos de tarjeta en una cuenta que no es de crédito', async () => {
      await http
        .post('/api/v1/accounts')
        .set('Authorization', comoAna())
        .send({ name: 'Efectivo', type: 'cash', credit_limit: '1000000' })
        .expect(400);
    });
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────

  describe('Dashboard', () => {
    it('el flujo del mes excluye transferencias y el gasto por categoría cuadra', async () => {
      const cuenta = await crearCuenta(comoAna(), { opening_balance: '0' });
      const otra = await crearCuenta(comoAna(), { name: 'Ahorros', type: 'savings' });
      const categoria = await crearCategoria(comoAna(), { name: 'Mercado' });

      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-05',
          amount: '5200000',
          type: 'income',
        })
        .expect(201);

      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-08-06',
          amount: '89900',
          type: 'expense',
          category_id: Number(categoria.id),
        })
        .expect(201);

      // Una transferencia que NO debe aparecer en el flujo.
      await http
        .post('/api/v1/transactions/transfer')
        .set('Authorization', comoAna())
        .send({
          from_account_id: Number(cuenta.id),
          to_account_id: Number(otra.id),
          date: '2026-08-07',
          amount: '1000000',
        })
        .expect(201);

      const respuesta = await http
        .get('/api/v1/dashboard?month=2026-08')
        .set('Authorization', comoAna())
        .expect(200);

      const { month, by_category } = respuesta.body.data;

      expect(month.income).toBe('5200000.00');
      expect(month.expense).toBe('89900.00');
      expect(month.net).toBe('5110100.00');

      const sumaPorCategoria = by_category.reduce(
        (total: number, fila: { total: string }) => total + Number(fila.total),
        0,
      );
      expect(sumaPorCategoria.toFixed(2)).toBe('89900.00');
    });
  });

  // ── Paginación ─────────────────────────────────────────────────────────────

  describe('Paginación', () => {
    it('devuelve meta.total y no solapa filas entre páginas', async () => {
      const cuenta = await crearCuenta(comoAna());

      for (let i = 1; i <= 5; i += 1) {
        await http
          .post('/api/v1/transactions')
          .set('Authorization', comoAna())
          .send({
            account_id: Number(cuenta.id),
            date: `2026-08-${String(i).padStart(2, '0')}`,
            amount: `${i}0000`,
            type: 'expense',
          })
          .expect(201);
      }

      const pagina1 = await http
        .get('/api/v1/transactions?page=1&per_page=2')
        .set('Authorization', comoAna())
        .expect(200);

      const pagina2 = await http
        .get('/api/v1/transactions?page=2&per_page=2')
        .set('Authorization', comoAna())
        .expect(200);

      expect(pagina1.body.meta.total).toBe(5);
      expect(pagina1.body.data).toHaveLength(2);

      const ids1 = pagina1.body.data.map((fila: { id: number }) => fila.id);
      const ids2 = pagina2.body.data.map((fila: { id: number }) => fila.id);
      expect(ids1.filter((id: number) => ids2.includes(id))).toHaveLength(0);
    });
  });
});
