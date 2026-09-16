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

  // Dos personas distintas: todo lo que verifica el aislamiento se apoya en
  // que Beto no pueda ver ni un byte de lo de Ana.
  let ana: string;
  let beto: string;

  const comoAna = (): string => ana;
  const comoBeto = (): string => beto;

  beforeAll(async () => {
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  beforeEach(async () => {
    await entorno.limpiar();
    ana = entorno.como(await entorno.crearUsuario({ displayName: 'Ana' }));
    beto = entorno.como(await entorno.crearUsuario({ displayName: 'Beto' }));
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
    it('un centro estático se guarda al crearlo y se puede cambiar después', async () => {
      // La forma pública se arma campo por campo, así que un dato nuevo se
      // pierde en silencio con la API devolviendo 201: ya pasó con la
      // recurrencia. Esta prueba existe para que no vuelva a pasar.
      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos', estatico: true });
      expect(centro.estatico).toBe(true);

      // Y llega al árbol, que es de donde lo lee la tabla de movimientos.
      const arbol = await http
        .get('/api/v1/categories')
        .set('Authorization', comoAna())
        .expect(200);
      expect(
        arbol.body.data.find((c: { id: number }) => Number(c.id) === Number(centro.id)).estatico,
      ).toBe(true);

      const suelto = await http
        .patch(`/api/v1/categories/${Number(centro.id)}`)
        .set('Authorization', comoAna())
        .send({ estatico: false })
        .expect(200);
      expect(suelto.body.data.estatico).toBe(false);
    });

    it('un centro nace dinámico si nadie dice lo contrario', async () => {
      const centro = await crearCategoria(comoAna(), { name: 'Costos variables' });
      expect(centro.estatico).toBe(false);
    });

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

  // ── Mover un concepto de grupo ─────────────────────────────────────────────

  describe('Mover un concepto de grupo', () => {
    it('lo acepta dentro del mismo centro', async () => {
      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos' });
      const vivienda = await crearCategoria(comoAna(), {
        name: 'Vivienda',
        parent_id: Number(centro.id),
      });
      const servicios = await crearCategoria(comoAna(), {
        name: 'Servicios públicos',
        parent_id: Number(centro.id),
      });
      const concepto = await crearCategoria(comoAna(), {
        name: 'Claro Móvil',
        parent_id: Number(vivienda.id),
      });

      const movido = await http
        .patch(`/api/v1/categories/${Number(concepto.id)}`)
        .set('Authorization', comoAna())
        .send({ parent_id: Number(servicios.id) })
        .expect(200);

      expect(Number(movido.body.data.parent_id)).toBe(Number(servicios.id));
    });

    it('lo acepta junto con el resto de los campos de la ficha', async () => {
      // Como lo manda la interfaz: el nombre, la recurrencia y el grupo en la
      // misma petición.
      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos' });
      const a = await crearCategoria(comoAna(), { name: 'A', parent_id: Number(centro.id) });
      const b = await crearCategoria(comoAna(), { name: 'B', parent_id: Number(centro.id) });
      const concepto = await crearCategoria(comoAna(), {
        name: 'Claro',
        parent_id: Number(a.id),
      });

      const movido = await http
        .patch(`/api/v1/categories/${Number(concepto.id)}`)
        .set('Authorization', comoAna())
        .send({
          name: 'Claro Móvil',
          recurrente: true,
          periodicidad: 'mensual',
          dia_de_pago: 1,
          mes_de_pago: null,
          parent_id: Number(b.id),
        })
        .expect(200);

      expect(Number(movido.body.data.parent_id)).toBe(Number(b.id));
      expect(movido.body.data.name).toBe('Claro Móvil');
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
      const grupo = await crearCategoria(comoAna(), { name: 'Servicios', icon: 'house' });
      expect(grupo.icon).toBe('house');

      const cambiado = await http
        .patch(`/api/v1/categories/${Number(grupo.id)}`)
        .set('Authorization', comoAna())
        .send({ icon: 'zap' })
        .expect(200);

      expect(cambiado.body.data.icon).toBe('zap');

      const sinIcono = await http
        .patch(`/api/v1/categories/${Number(grupo.id)}`)
        .set('Authorization', comoAna())
        .send({ icon: null })
        .expect(200);

      expect(sinIcono.body.data.icon).toBeNull();
    });

    it('no se traga un nombre de más de 64 caracteres', async () => {
      const grupo = await crearCategoria(comoAna(), { name: 'Servicios' });

      await http
        .patch(`/api/v1/categories/${Number(grupo.id)}`)
        .set('Authorization', comoAna())
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
    const conUnMovimiento = async () => {
      const cuenta = await crearCuenta(comoAna());
      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos' });
      const grupo = await crearCategoria(comoAna(), {
        name: 'Servicios públicos',
        parent_id: Number(centro.id),
      });
      const concepto = await crearCategoria(comoAna(), {
        name: 'Aseo',
        parent_id: Number(grupo.id),
      });
      const otro = await crearCategoria(comoAna(), { name: 'Variables' });

      const movimiento = await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          account_id: Number(cuenta.id),
          date: '2026-09-16',
          amount: '450000',
          type: 'expense',
          category_id: Number(concepto.id),
        })
        .expect(201);

      return { centro, grupo, concepto, otro, movimiento: movimiento.body.data };
    };

    it('cuenta los movimientos del SUBÁRBOL, no solo los de la fila', async () => {
      // El movimiento cuelga del concepto, tres niveles por debajo del centro.
      // Contando solo el id del centro, un centro con cuarenta daba cero.
      const { centro, grupo, concepto } = await conUnMovimiento();

      for (const [categoria, subcategorias] of [
        [centro, 2],
        [grupo, 1],
        [concepto, 0],
      ] as const) {
        const respuesta = await http
          .get(`/api/v1/categories/${Number(categoria.id)}/usos`)
          .set('Authorization', comoAna())
          .expect(200);

        expect(respuesta.body.data).toEqual({ movimientos: 1, subcategorias });
      }
    });

    it('se niega si hay movimientos y no se dice a dónde pasan', async () => {
      const { concepto } = await conUnMovimiento();

      await http
        .delete(`/api/v1/categories/${Number(concepto.id)}`)
        .set('Authorization', comoAna())
        .expect(409);
    });

    it('reasigna los movimientos y borra', async () => {
      const { concepto, otro, movimiento } = await conUnMovimiento();

      await http
        .delete(`/api/v1/categories/${Number(concepto.id)}?reasignar_a=${Number(otro.id)}`)
        .set('Authorization', comoAna())
        .expect(204);

      // El movimiento sigue ahí, con su categoría nueva. Lo que NO puede pasar
      // es que quede en null: `category_id` es `ON DELETE SET NULL`, así que un
      // borrado sin reasignar lo deja sin clasificar en silencio.
      const despues = await http
        .get(`/api/v1/transactions/${Number(movimiento.id)}`)
        .set('Authorization', comoAna())
        .expect(200);

      expect(Number(despues.body.data.category_id)).toBe(Number(otro.id));
    });

    it('se lleva el subárbol entero: los conceptos no ascienden a centros', async () => {
      // `parent_id` es `ON DELETE SET NULL`. Borrando solo el grupo, sus
      // conceptos se quedaban con el padre en nulo y aparecían como centros de
      // costos nuevos en la raíz del árbol.
      const { grupo, concepto, otro } = await conUnMovimiento();

      await http
        .delete(`/api/v1/categories/${Number(grupo.id)}?reasignar_a=${Number(otro.id)}`)
        .set('Authorization', comoAna())
        .expect(204);

      const arbol = await http
        .get('/api/v1/categories')
        .set('Authorization', comoAna())
        .expect(200);

      const ids = arbol.body.data.map((c: { id: string | number }) => Number(c.id));
      expect(ids).not.toContain(Number(concepto.id));
      expect(ids).not.toContain(Number(grupo.id));
    });

    it('no acepta un destino que también se va a borrar', async () => {
      // Reasignar al concepto que cuelga del grupo que se está borrando deja
      // los movimientos sin clasificar, que es justo lo que se quiere evitar.
      const { grupo, concepto } = await conUnMovimiento();

      await http
        .delete(`/api/v1/categories/${Number(grupo.id)}?reasignar_a=${Number(concepto.id)}`)
        .set('Authorization', comoAna())
        .expect(409);
    });

    it('sin movimientos no hace falta destino', async () => {
      const vacia = await crearCategoria(comoAna(), { name: 'Sin usar' });

      await http
        .delete(`/api/v1/categories/${Number(vacia.id)}`)
        .set('Authorization', comoAna())
        .expect(204);
    });

    it('Beto no puede borrar una categoría de Ana', async () => {
      const deAna = await crearCategoria(comoAna(), { name: 'Privada' });

      await http
        .delete(`/api/v1/categories/${Number(deAna.id)}`)
        .set('Authorization', comoBeto())
        .expect(404);
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

      // El resumen se pide por RANGO, no por mes: es el mismo recorte que usa
      // la lista de movimientos, para que las cifras de una expliquen la otra.
      const respuesta = await http
        .get('/api/v1/dashboard?from=2026-08-01&to=2026-08-31')
        .set('Authorization', comoAna())
        .expect(200);

      const { range, by_category, trend, breakdown_level } = respuesta.body.data;

      expect(range.income).toBe('5200000.00');
      expect(range.expense).toBe('89900.00');
      expect(range.net).toBe('5110100.00');

      // Un mes entero se agrupa por día, y los días sin gasto vienen en cero:
      // omitirlos haría que la línea uniera el 3 con el 20 en línea recta.
      expect(breakdown_level).toBe('centro de costos');
      expect(trend).toHaveLength(31);
      expect(trend.every((p: { bucket: string }) => p.bucket.startsWith('2026-08'))).toBe(true);

      const sumaPorCategoria = by_category.reduce(
        (total: number, fila: { total: string }) => total + Number(fila.total),
        0,
      );
      expect(sumaPorCategoria.toFixed(2)).toBe('89900.00');
    });
  });

  // ── Centros de costos, grupos y conceptos ──────────────────────────────────

  describe('Jerarquía de tres niveles', () => {
    it('filtrar por un CENTRO trae los movimientos de todos sus conceptos', async () => {
      // Costos fijos → Servicios públicos → Celsia
      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos' });
      const grupo = await crearCategoria(comoAna(), {
        name: 'Servicios públicos',
        parent_id: Number(centro.id),
      });
      const concepto = await crearCategoria(comoAna(), {
        name: 'Celsia (Energia)',
        parent_id: Number(grupo.id),
      });

      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          date: '2026-08-10',
          amount: '200000',
          type: 'expense',
          category_id: Number(concepto.id),
          description: 'Celsia (Energia)',
        })
        .expect(201);

      // El movimiento cuelga del CONCEPTO. Filtrar por el centro tiene que
      // encontrarlo igual, o un desglose por centro saldría siempre vacío.
      for (const id of [centro.id, grupo.id, concepto.id]) {
        const r = await http
          .get(`/api/v1/transactions?category_id=${Number(id)}`)
          .set('Authorization', comoAna())
          .expect(200);
        expect(r.body.data).toHaveLength(1);
      }
    });

    it('la búsqueda NO distingue mayúsculas', async () => {
      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
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
        .get('/api/v1/transactions?q=celsia')
        .set('Authorization', comoAna())
        .expect(200);

      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0].description).toBe('Celsia (Energia)');
    });

    it('el desglose del resumen BAJA un nivel al filtrar', async () => {
      // DOS centros con gasto. Con uno solo, el nivel de los centros no
      // desglosa nada —"el 100 % está en el único sitio donde puede estar"— y
      // el resumen se lo salta, que es lo que comprueba la prueba de abajo.
      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos' });
      const servicios = await crearCategoria(comoAna(), {
        name: 'Servicios públicos',
        parent_id: Number(centro.id),
      });
      const celsia = await crearCategoria(comoAna(), {
        name: 'Celsia',
        parent_id: Number(servicios.id),
      });
      const vivienda = await crearCategoria(comoAna(), {
        name: 'Vivienda',
        parent_id: Number(centro.id),
      });
      const alquiler = await crearCategoria(comoAna(), {
        name: 'Alquiler',
        parent_id: Number(vivienda.id),
      });
      const otroCentro = await crearCategoria(comoAna(), { name: 'Costos variables' });

      for (const [id, amount] of [
        [celsia.id, '300000'],
        [alquiler.id, '900000'],
        [otroCentro.id, '50000'],
      ] as const) {
        await http
          .post('/api/v1/transactions')
          .set('Authorization', comoAna())
          .send({ date: '2026-08-12', amount, type: 'expense', category_id: Number(id) })
          .expect(201);
      }

      const sinFiltro = await http
        .get('/api/v1/dashboard?from=2026-08-01&to=2026-08-31')
        .set('Authorization', comoAna())
        .expect(200);
      expect(sinFiltro.body.data.breakdown_level).toBe('centro de costos');
      expect(sinFiltro.body.data.by_category[0].name).toBe('Costos fijos');

      // Fijos contra variables, con los nombres de los centros.
      expect(
        sinFiltro.body.data.expense_by_center.map((f: { name: string; total: string }) => [
          f.name,
          f.total,
        ]),
      ).toEqual([
        ['Costos fijos', '1200000.00'],
        ['Costos variables', '50000.00'],
      ]);

      const dentroDelCentro = await http
        .get(`/api/v1/dashboard?from=2026-08-01&to=2026-08-31&category_id=${Number(centro.id)}`)
        .set('Authorization', comoAna())
        .expect(200);
      expect(dentroDelCentro.body.data.breakdown_level).toBe('grupo');
      expect(dentroDelCentro.body.data.by_category[0].name).toBe('Vivienda');

      const dentroDelGrupo = await http
        .get(`/api/v1/dashboard?from=2026-08-01&to=2026-08-31&category_id=${Number(servicios.id)}`)
        .set('Authorization', comoAna())
        .expect(200);
      expect(dentroDelGrupo.body.data.breakdown_level).toBe('concepto');
      expect(dentroDelGrupo.body.data.by_category[0].name).toBe('Celsia');
    });

    it('con un solo centro con gasto, el desglose se salta ese nivel', async () => {
      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos' });
      const servicios = await crearCategoria(comoAna(), {
        name: 'Servicios públicos',
        parent_id: Number(centro.id),
      });
      const vivienda = await crearCategoria(comoAna(), {
        name: 'Vivienda',
        parent_id: Number(centro.id),
      });
      // Un centro más, SIN gasto: existir no basta para salir en el desglose.
      await crearCategoria(comoAna(), { name: 'Costos variables' });

      for (const [id, amount] of [
        [servicios.id, '300000'],
        [vivienda.id, '900000'],
      ] as const) {
        await http
          .post('/api/v1/transactions')
          .set('Authorization', comoAna())
          .send({ date: '2026-08-12', amount, type: 'expense', category_id: Number(id) })
          .expect(201);
      }

      const r = await http
        .get('/api/v1/dashboard?from=2026-08-01&to=2026-08-31')
        .set('Authorization', comoAna())
        .expect(200);

      // Se muestran los GRUPOS del único centro con gasto, y el nombre del
      // centro pasa a ser el subtítulo. Enseñar "Costos fijos, 100 %" no
      // responde nada: eso ya se sabía antes de mirar.
      expect(r.body.data.breakdown_level).toBe('grupo');
      expect(r.body.data.breakdown_parent.name).toBe('Costos fijos');
      expect(r.body.data.by_category.map((f: { name: string }) => f.name)).toEqual([
        'Vivienda',
        'Servicios públicos',
      ]);

      // El reparto fijos/variables NO baja con el desglose: aunque la dona
      // esté enseñando grupos, esta pregunta se responde en los centros.
      expect(r.body.data.expense_by_center).toHaveLength(1);
      expect(r.body.data.expense_by_center[0].name).toBe('Costos fijos');
      expect(r.body.data.expense_by_center[0].total).toBe('1200000.00');
    });

    it('el presupuesto del mes suma los recurrentes, pagados o no', async () => {
      // El mes EN CURSO, calculado igual que la API. Una fecha fija dejaría de
      // valer el mes que viene: el presupuesto mira siempre hoy.
      const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const mes = hoy.toISOString().slice(0, 7);
      const diaDe = (mesesAtras: number) =>
        new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - mesesAtras, 10))
          .toISOString()
          .slice(0, 10);

      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos' });
      const alquiler = await crearCategoria(comoAna(), {
        name: 'Alquiler',
        parent_id: Number(centro.id),
        recurrente: true,
        periodicidad: 'mensual',
        dia_de_pago: 15,
      });
      const agua = await crearCategoria(comoAna(), {
        name: 'Agua',
        parent_id: Number(centro.id),
        recurrente: true,
        periodicidad: 'mensual',
        dia_de_pago: 10,
      });
      // Sin marcar: un gasto que no vuelve no es presupuesto.
      const mercado = await crearCategoria(comoAna(), {
        name: 'Mercado',
        parent_id: Number(centro.id),
      });

      const gasto = async (categoryId: unknown, date: string, amount: string) => {
        await http
          .post('/api/v1/transactions')
          .set('Authorization', comoAna())
          .send({ date, amount, type: 'expense', category_id: Number(categoryId) })
          .expect(201);
      };

      // La historia es de donde sale lo que se ESPERA pagar: el promedio de
      // los meses con pago dentro de los tres anteriores.
      await gasto(alquiler.id, diaDe(1), '1000000');
      await gasto(agua.id, diaDe(2), '100000');
      await gasto(agua.id, diaDe(1), '140000');
      // Este mes: el alquiler ya se pagó, y más caro que la última vez.
      await gasto(alquiler.id, `${mes}-01`, '1100000');
      await gasto(mercado.id, `${mes}-01`, '80000');

      const r = await http
        .get(`/api/v1/dashboard?from=${mes}-01&to=${mes}-28`)
        .set('Authorization', comoAna())
        .expect(200);

      // 1.100.000 del alquiler PAGADO —por lo que costó de verdad, no por lo
      // que costaba— más 120.000 del agua, que falta y se estima promediando
      // sus dos meses: (100.000 + 140.000) / 2. El mercado no entra: no es
      // recurrente.
      expect(r.body.data.required_budget).toBe('1220000.00');

      // Y lo que falta es solo el agua. El presupuesto no se encoge al pagar
      // —esa es la diferencia entre las dos cifras—, la lista de pendientes sí.
      expect(r.body.data.pending).toHaveLength(1);
      expect(r.body.data.pending[0].name).toBe('Agua');
      expect(r.body.data.pending[0].expected_amount).toBe('120000.00');
    });

    it('un movimiento SIN confirmar no saca al concepto de los pendientes', async () => {
      const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const mes = hoy.toISOString().slice(0, 7);

      const centro = await crearCategoria(comoAna(), { name: 'Costos fijos' });
      const agua = await crearCategoria(comoAna(), {
        name: 'Agua',
        parent_id: Number(centro.id),
        recurrente: true,
        periodicidad: 'mensual',
        dia_de_pago: 10,
      });

      // Un pago anunciado pero no confirmado: una transferencia programada, un
      // débito que todavía no aparece en el extracto.
      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna())
        .send({
          date: `${mes}-01`,
          amount: '120000',
          type: 'expense',
          category_id: Number(agua.id),
          status: 'pending',
        })
        .expect(201);

      const r = await http
        .get(`/api/v1/dashboard?from=${mes}-01&to=${mes}-28`)
        .set('Authorization', comoAna())
        .expect(200);

      // Sigue pendiente: un pago pendiente es lo que está en el presupuesto y
      // NO tiene todavía un movimiento confirmado que lo respalde. Sacarlo de
      // la lista prometería que algo está resuelto cuando no lo está.
      expect(r.body.data.pending).toHaveLength(1);
      expect(r.body.data.pending[0].name).toBe('Agua');
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
