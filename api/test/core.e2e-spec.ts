import request from 'supertest';

import { startApp, type TestEnvironment } from './helpers/app';

/**
 * Fase 1 — el núcleo, contra MariaDB real.
 *
 * Lo que se protege aquí es lo que el PRD exige antes de avanzar de fase: que
 * los saldos se deriven bien, que los splits no cuadrados se rechacen, y que
 * ningún usuario pueda ver ni tocar los datos de otro.
 */
describe('Fase 1 — Núcleo (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  // Dos personas distintas: todo lo que verifica el aislamiento se apoya en
  // que Beto no pueda ver ni un byte de lo de Ana.
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

  // ── Saldos derivados ───────────────────────────────────────────────────────

  describe('Saldos derivados', () => {
    it('el saldo cuadra al centavo con la suma de los movimientos', async () => {
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

    it('un movimiento pending no altera el saldo confirmado, pero sí el proyectado', async () => {
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

    it('en una tarjeta de crédito el consumo aumenta la deuda y baja el cupo', async () => {
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
    it('acepta un movimiento cuyos splits cuadran exactamente', async () => {
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

    it('rechaza con 422 si los splits no suman el monto, y no persiste nada', async () => {
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

      // El ROLLBACK debe haber dejado la base intacta.
      const list = await http.get('/api/v2/transactions').set('Authorization', asAna()).expect(200);
      expect(list.body.meta.total).toBe(0);
    });
  });

  // ── Transferencias ─────────────────────────────────────────────────────────

  describe('Transferencias', () => {
    it('crea dos patas emparejadas y no altera el patrimonio total', async () => {
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

    it('rechaza una transferencia a la misma cuenta', async () => {
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

    it('borrar una pata borra la otra: nunca queda una transferencia coja', async () => {
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

  // ── No-rigidez ─────────────────────────────────────────────────────────────

  describe('No-rigidez', () => {
    it('guarda un movimiento SIN categoría sin protestar', async () => {
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

    it('permite exceder el cupo de la tarjeta: informa, no bloquea', async () => {
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

  // ── Autorización por propiedad ─────────────────────────────────────────────

  describe('Scoping por usuario', () => {
    it('Beto no ve los movimientos de Ana', async () => {
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

    it('pedir una cuenta ajena por id responde 404, no 403: no confirma que exista', async () => {
      const account = await createAccount(asAna());

      await http.get(`/api/v2/accounts/${account.id}`).set('Authorization', asBeto()).expect(404);
    });

    it('Beto no puede editar una cuenta de Ana', async () => {
      const account = await createAccount(asAna());

      await http
        .patch(`/api/v2/accounts/${account.id}`)
        .set('Authorization', asBeto())
        .send({ name: 'Secuestrada' })
        .expect(404);
    });

    it('Beto no puede crear un movimiento contra la cuenta de Ana', async () => {
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

    it('enviar user_id en el body no cambia el propietario: lo rechaza el pipe', async () => {
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

  // ── Categorías ─────────────────────────────────────────────────────────────

  describe('Categorías', () => {
    it('un centro estático se guarda al crearlo y se puede cambiar después', async () => {
      // La forma pública se arma campo por campo, así que un dato nuevo se
      // pierde en silencio con la API devolviendo 201: ya pasó con la
      // recurrencia. Esta prueba existe para que no vuelva a pasar.
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos', isStatic: true });
      expect(costCenter.isStatic).toBe(true);

      // Y llega al árbol, que es de donde lo lee la tabla de movimientos.
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

    it('un centro nace dinámico si nadie dice lo contrario', async () => {
      const costCenter = await createCategory(asAna(), { name: 'Costos variables' });
      expect(costCenter.isStatic).toBe(false);
    });

    it('rechaza con 422 un ciclo en el árbol', async () => {
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

    it('devuelve el árbol anidado, no una lista plana', async () => {
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

    it('siembra el diccionario inicial y luego se niega a repetirlo', async () => {
      const first = await http
        .post('/api/v2/categories/seed')
        .set('Authorization', asAna())
        .expect(201);

      // La plantilla es un SNAPSHOT de dos centros y siete categorías desde el
      // 17 de septiembre de 2026 (ver `categories.template.ts`): nueve filas.
      // Antes sembraba un diccionario de cuarenta y pico conceptos.
      expect(first.body.data.created).toBe(9);

      await http.post('/api/v2/categories/seed').set('Authorization', asAna()).expect(409);
    });
  });

  // ── Mover un concepto de grupo ─────────────────────────────────────────────

  describe('Mover un concepto de grupo', () => {
    it('lo acepta dentro del mismo centro', async () => {
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

    it('lo acepta junto con el resto de los campos de la ficha', async () => {
      // Como lo manda la interfaz: el nombre, la recurrencia y el grupo en la
      // misma petición.
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

  // ── El icono de una categoría ──────────────────────────────────────────────

  describe('El icono de un grupo', () => {
    it('se guarda al crear, se cambia al editar y se puede quitar', async () => {
      /*
        Quitarlo es el caso que hay que probar, y no por capricho: el DTO
        declara `icon?: string`, así que a simple vista un `null` no cabe. Lo
        deja pasar `@IsOptional()`, que en class-validator salta la validación
        tanto con `undefined` como con `null`, y el servicio lo aplica porque
        distingue «no vino» de «vino vacío» con un `!== undefined`.

        Son dos comportamientos de dos bibliotecas que podrían cambiar sin que
        nadie lo note, y el síntoma sería silencioso: el icono se queda puesto
        y nadie sabe por qué.
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

    it('no se traga un nombre de más de 64 caracteres', async () => {
      const group = await createCategory(asAna(), { name: 'Servicios' });

      await http
        .patch(`/api/v2/categories/${Number(group.id)}`)
        .set('Authorization', asAna())
        .send({ icon: 'x'.repeat(65) })
        .expect(400);
    });
  });

  // ── Eliminar una categoría ─────────────────────────────────────────────────

  /**
   * Borrar una categoría es la única operación destructiva del árbol, y hasta
   * ahora no tenía ni una prueba: se limitaba a negarse en cuanto había un
   * movimiento, así que no había mucho que comprobar.
   *
   * Ahora borra de verdad, y hay tres cosas que no pueden fallar en silencio:
   * que los movimientos acaben donde se dijo, que no se queden sin clasificar
   * por el `ON DELETE SET NULL`, y que los conceptos de un grupo borrado se
   * vayan con él en vez de ascender a centros de costos.
   */
  describe('Eliminar una categoría', () => {
    /** Un árbol de tres niveles con un movimiento colgando del concepto. */
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

    it('cuenta los movimientos del SUBÁRBOL, no solo los de la fila', async () => {
      // El movimiento cuelga del concepto, tres niveles por debajo del centro.
      // Contando solo el id del centro, un centro con cuarenta daba cero.
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

    it('se niega si hay movimientos y no se dice a dónde pasan', async () => {
      const { concept } = await withOneTransaction();

      await http
        .delete(`/api/v2/categories/${Number(concept.id)}`)
        .set('Authorization', asAna())
        .expect(409);
    });

    it('reasigna los movimientos y borra', async () => {
      const { concept, other, transaction } = await withOneTransaction();

      await http
        .delete(`/api/v2/categories/${Number(concept.id)}?reassignTo=${Number(other.id)}`)
        .set('Authorization', asAna())
        .expect(204);

      // El movimiento sigue ahí, con su categoría nueva. Lo que NO puede pasar
      // es que quede en null: `category_id` es `ON DELETE SET NULL`, así que un
      // borrado sin reasignar lo deja sin clasificar en silencio.
      const after = await http
        .get(`/api/v2/transactions/${Number(transaction.id)}`)
        .set('Authorization', asAna())
        .expect(200);

      expect(Number(after.body.data.categoryId)).toBe(Number(other.id));
    });

    it('se lleva el subárbol entero: los conceptos no ascienden a centros', async () => {
      // `parent_id` es `ON DELETE SET NULL`. Borrando solo el grupo, sus
      // conceptos se quedaban con el padre en nulo y aparecían como centros de
      // costos nuevos en la raíz del árbol.
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

    it('no acepta un destino que también se va a borrar', async () => {
      // Reasignar al concepto que cuelga del grupo que se está borrando deja
      // los movimientos sin clasificar, que es justo lo que se quiere evitar.
      const { group, concept } = await withOneTransaction();

      await http
        .delete(`/api/v2/categories/${Number(group.id)}?reassignTo=${Number(concept.id)}`)
        .set('Authorization', asAna())
        .expect(409);
    });

    it('sin movimientos no hace falta destino', async () => {
      const empty = await createCategory(asAna(), { name: 'Sin usar' });

      await http
        .delete(`/api/v2/categories/${Number(empty.id)}`)
        .set('Authorization', asAna())
        .expect(204);
    });

    it('Beto no puede borrar una categoría de Ana', async () => {
      const anas = await createCategory(asAna(), { name: 'Privada' });

      await http
        .delete(`/api/v2/categories/${Number(anas.id)}`)
        .set('Authorization', asBeto())
        .expect(404);
    });
  });

  // ── Etiquetas ──────────────────────────────────────────────────────────────

  describe('Etiquetas', () => {
    it('crear una etiqueta repetida devuelve la existente en vez de fallar', async () => {
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

    it('se crean al vuelo al etiquetar un movimiento', async () => {
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

  // ── Cuentas ────────────────────────────────────────────────────────────────

  describe('Cuentas', () => {
    it('no deja borrar una cuenta con transactions: obliga a archivar', async () => {
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

    it('rechaza campos de tarjeta en una cuenta que no es de crédito', async () => {
      await http
        .post('/api/v2/accounts')
        .set('Authorization', asAna())
        .send({ name: 'Efectivo', type: 'cash', creditLimit: '1000000' })
        .expect(400);
    });
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────

  describe('Dashboard', () => {
    it('el flujo del mes excluye transferencias y el gasto por categoría cuadra', async () => {
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

      // Una transferencia que NO debe aparecer en el flujo.
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

      // El resumen se pide por RANGO, no por mes: es el mismo recorte que usa
      // la lista de movimientos, para que las cifras de una expliquen la otra.
      const response = await http
        .get('/api/v2/dashboard?from=2026-08-01&to=2026-08-31')
        .set('Authorization', asAna())
        .expect(200);

      const { range, byCategory, trend, breakdownLevel } = response.body.data;

      expect(range.income).toBe('5200000.00');
      expect(range.expense).toBe('89900.00');
      expect(range.net).toBe('5110100.00');

      // Un mes entero se agrupa por día, y los días sin gasto vienen en cero:
      // omitirlos haría que la línea uniera el 3 con el 20 en línea recta.
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

  // ── Centros de costos, grupos y conceptos ──────────────────────────────────

  describe('Jerarquía de tres niveles', () => {
    it('filtrar por un CENTRO trae los movimientos de todos sus conceptos', async () => {
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

      // El movimiento cuelga del CONCEPTO. Filtrar por el centro tiene que
      // encontrarlo igual, o un desglose por centro saldría siempre vacío.
      for (const id of [costCenter.id, group.id, concept.id]) {
        const r = await http
          .get(`/api/v2/transactions?categoryId=${Number(id)}`)
          .set('Authorization', asAna())
          .expect(200);
        expect(r.body.data).toHaveLength(1);
      }
    });

    it('la búsqueda NO distingue mayúsculas', async () => {
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

      // Postgres compara distinguiendo mayúsculas, a diferencia de MariaDB.
      // Quien busca escribe en minúscula y espera encontrarlo.
      const r = await http
        .get('/api/v2/transactions?q=celsia')
        .set('Authorization', asAna())
        .expect(200);

      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0].description).toBe('Celsia (Energia)');
    });

    it('el desglose del resumen BAJA un nivel al filtrar', async () => {
      // DOS centros con gasto. Con uno solo, el nivel de los centros no
      // desglosa nada —"el 100 % está en el único sitio donde puede estar"— y
      // el resumen se lo salta, que es lo que comprueba la prueba de abajo.
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

      // Fijos contra variables, con los nombres de los centros.
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

    it('con un solo centro con gasto, el desglose se salta ese nivel', async () => {
      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      const utilities = await createCategory(asAna(), {
        name: 'Servicios públicos',
        parentId: Number(costCenter.id),
      });
      const housing = await createCategory(asAna(), {
        name: 'Vivienda',
        parentId: Number(costCenter.id),
      });
      // Un centro más, SIN gasto: existir no basta para salir en el desglose.
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

      // Se muestran los GRUPOS del único centro con gasto, y el nombre del
      // centro pasa a ser el subtítulo. Enseñar "Costos fijos, 100 %" no
      // responde nada: eso ya se sabía antes de mirar.
      expect(r.body.data.breakdownLevel).toBe('category');
      expect(r.body.data.breakdownParent.name).toBe('Costos fijos');
      expect(r.body.data.byCategory.map((f: { name: string }) => f.name)).toEqual([
        'Vivienda',
        'Servicios públicos',
      ]);

      // El reparto fijos/variables NO baja con el desglose: aunque la dona
      // esté enseñando grupos, esta pregunta se responde en los centros.
      expect(r.body.data.expenseByCostCenter).toHaveLength(1);
      expect(r.body.data.expenseByCostCenter[0].name).toBe('Costos fijos');
      expect(r.body.data.expenseByCostCenter[0].total).toBe('1200000.00');
    });

    it('el presupuesto del mes suma los recurrentes, pagados o no', async () => {
      // El mes EN CURSO, calculado igual que la API. Una fecha fija dejaría de
      // valer el mes que viene: el presupuesto mira siempre hoy.
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
      // Sin marcar: un gasto que no vuelve no es presupuesto.
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

      // La historia es de donde sale lo que se ESPERA pagar: el promedio de
      // los meses con pago dentro de los tres anteriores.
      await expense(rent.id, dayOf(1), '1000000');
      await expense(water.id, dayOf(2), '100000');
      await expense(water.id, dayOf(1), '140000');
      // Este mes: el alquiler ya se pagó, y más caro que la última vez.
      await expense(rent.id, `${month}-01`, '1100000');
      await expense(groceries.id, `${month}-01`, '80000');

      const r = await http
        .get(`/api/v2/dashboard?from=${month}-01&to=${month}-28`)
        .set('Authorization', asAna())
        .expect(200);

      // 1.100.000 del alquiler PAGADO —por lo que costó de verdad, no por lo
      // que costaba— más 120.000 del agua, que falta y se estima promediando
      // sus dos meses: (100.000 + 140.000) / 2. El mercado no entra: no es
      // recurrente.
      expect(r.body.data.requiredBudget).toBe('1220000.00');

      // Y lo que falta es solo el agua. El presupuesto no se encoge al pagar
      // —esa es la diferencia entre las dos cifras—, la lista de pendientes sí.
      expect(r.body.data.pending).toHaveLength(1);
      expect(r.body.data.pending[0].name).toBe('Agua');
      expect(r.body.data.pending[0].expectedAmount).toBe('120000.00');
    });

    it('un movimiento SIN confirmar no saca al concepto de los pendientes', async () => {
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

      // Un pago anunciado pero no confirmado: una transferencia programada, un
      // débito que todavía no aparece en el extracto.
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

      // Sigue pendiente: un pago pendiente es lo que está en el presupuesto y
      // NO tiene todavía un movimiento confirmado que lo respalde. Sacarlo de
      // la lista prometería que algo está resuelto cuando no lo está.
      expect(r.body.data.pending).toHaveLength(1);
      expect(r.body.data.pending[0].name).toBe('Agua');
    });

    it('un concepto ARCHIVADO sale de los pendientes pero sigue contando en los históricos', async () => {
      /*
        Archivar mira hacia adelante: el gimnasio que se dio de baja no se
        vuelve a pedir cada mes. Pero no reescribe lo que ya pasó: lo que
        costó mientras estuvo vivo sigue en el total gastado y en la dona.

        Las dos mitades se miran en UNA sola respuesta —el rango abarca el mes
        pasado y el actual— porque los pendientes salen siempre del mes en
        curso, mientras que los totales salen del rango pedido. Si el filtro
        de archivados se moviera a la consulta de la que beben los dos, esta
        prueba lo diría: el total perdería los 90.000.
      */
      const today = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const month = today.toISOString().slice(0, 7);
      const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 10))
        .toISOString()
        .slice(0, 7);

      const costCenter = await createCategory(asAna(), { name: 'Costos fijos' });
      // El agua no se toca: es el testigo de que la lista sigue viva.
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

      // El gimnasio se pagó el mes pasado; este mes ninguno de los dos.
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

      // Y después se da de baja: se archiva, no se borra.
      await http
        .patch(`/api/v2/categories/${gym.id}`)
        .set('Authorization', asAna())
        .send({ isArchived: true })
        .expect(200);

      const r = await http
        .get(`/api/v2/dashboard?from=${lastMonth}-01&to=${month}-28`)
        .set('Authorization', asAna())
        .expect(200);

      // Sin pagar este mes los dos, pero solo el agua se pide: el gimnasio
      // archivado ya no es algo que falte pagar, ni entra en el presupuesto.
      expect(r.body.data.pending.map((p: { name: string }) => p.name)).toEqual(['Agua']);
      expect(r.body.data.requiredBudget).toBe('0.00');

      // Lo que costó mientras estuvo vivo sigue ahí: en el total y en la dona.
      expect(r.body.data.range.expense).toBe('90000.00');
      const byCategoryRows = r.body.data.byCategory as { categoryId: unknown; total: string }[];
      expect(byCategoryRows.map((row) => Number(row.total)).reduce((a, b) => a + b, 0)).toBe(90000);
    });
  });

  // ── Paginación ─────────────────────────────────────────────────────────────

  describe('Paginación', () => {
    it('devuelve meta.total y no solapa filas entre páginas', async () => {
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
