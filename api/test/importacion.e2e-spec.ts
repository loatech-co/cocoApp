import request from 'supertest';

import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

/**
 * Fase 2 — Importación (M4) y categorización automática (T1).
 *
 * Lo que se protege aquí: que nada entre a las finanzas de nadie sin
 * confirmación, que los repetidos se SEÑALEN sin bloquear, que confirmar dos
 * veces no duplique nada, y que se pueda deshacer.
 */
describe('Fase 2 — Importación (e2e)', () => {
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;

  let ana: UsuarioDePrueba;
  let beto: UsuarioDePrueba;
  let comoAna: string;
  let comoBeto: string;
  let cuenta: { id: number };
  let mercado: { id: number };
  let domicilios: { id: number };

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
    beto = await entorno.crearUsuario({ displayName: 'Beto' });
    comoAna = entorno.como(ana);
    comoBeto = entorno.como(beto);

    cuenta = await crearCuenta(comoAna);
    mercado = await crearCategoria(comoAna, 'Mercado');
    domicilios = await crearCategoria(comoAna, 'Domicilios');
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const crearCuenta = async (auth: string) => {
    const respuesta = await http
      .post('/api/v1/accounts')
      .set('Authorization', auth)
      .send({ name: 'Bancolombia', type: 'debit', opening_balance: '0' })
      .expect(201);
    return respuesta.body.data;
  };

  const crearCategoria = async (auth: string, name: string) => {
    const respuesta = await http
      .post('/api/v1/categories')
      .set('Authorization', auth)
      .send({ name, kind: 'expense' })
      .expect(201);
    return respuesta.body.data;
  };

  const FILAS = [
    { date: '2026-08-01', amount: '45900.00', type: 'expense' as const, description: 'Exito Poblado' },
    { date: '2026-08-02', amount: '23500.00', type: 'expense' as const, description: 'Rappi Comida' },
    { date: '2026-08-03', amount: '12000.50', type: 'expense' as const, description: 'Juan Valdez' },
  ];

  const importar = (auth: string, body: Record<string, unknown> = {}) =>
    http
      .post('/api/v1/imports')
      .set('Authorization', auth)
      .send({
        account_id: cuenta.id,
        source: 'image',
        label: 'extracto-agosto.png',
        ocr_provider: 'tesseract',
        rows: FILAS,
        ...body,
      });

  // ── Creación del lote ──────────────────────────────────────────────────────

  describe('Crear un lote', () => {
    it('nace en borrador y NO crea ni un movimiento', async () => {
      const respuesta = await importar(comoAna).expect(201);

      expect(respuesta.body.data).toMatchObject({
        status: 'draft',
        source: 'image',
        label: 'extracto-agosto.png',
        ocr_provider: 'tesseract',
        counts: { pending: 0, accepted: 3, duplicate: 0, skipped: 0 },
      });
      expect(respuesta.body.data.rows).toHaveLength(3);

      // Nada ha tocado las finanzas todavía. Este es el punto entero del paso.
      const movimientos = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoAna)
        .expect(200);
      expect(movimientos.body.data).toHaveLength(0);
    });

    it('conserva el orden del documento', async () => {
      const respuesta = await importar(comoAna).expect(201);
      expect(respuesta.body.data.rows.map((f: { position: number }) => f.position)).toEqual([
        0, 1, 2,
      ]);
      expect(respuesta.body.data.rows[0].description).toBe('Exito Poblado');
    });

    it('respeta los centavos', async () => {
      const respuesta = await importar(comoAna).expect(201);
      expect(respuesta.body.data.rows[2].amount).toBe('12000.50');
    });

    it('rechaza una cuenta ajena con 422, sin confirmar que existe', async () => {
      // 422 y no 404: el cuerpo está bien formado pero referencia algo que no
      // sirve. El 404 se reserva para "el recurso de esta URL no existe".
      // El mensaje no distingue "no existe" de "es de otro" — eso es lo que
      // impide usar este endpoint para enumerar cuentas ajenas.
      await http
        .post('/api/v1/imports')
        .set('Authorization', comoBeto)
        .send({ account_id: cuenta.id, source: 'image', rows: FILAS })
        .expect(422);
    });

    it('rechaza un lote vacío', async () => {
      await importar(comoAna, { rows: [] }).expect(400);
    });

    it('rechaza un monto que no es decimal válido', async () => {
      await importar(comoAna, {
        rows: [{ ...FILAS[0], amount: '45900.999' }],
      }).expect(400);
    });

    it('rechaza más filas de las que un extracto real puede traer', async () => {
      const demasiadas = Array.from({ length: 501 }, () => FILAS[0]);
      await importar(comoAna, { rows: demasiadas }).expect(400);
    });
  });

  // ── Deduplicación ──────────────────────────────────────────────────────────

  describe('Deduplicación', () => {
    it('SEÑALA lo que ya existe, sin descartarlo', async () => {
      const primero = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${primero.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      // El mismo extracto otra vez.
      const segundo = await importar(comoAna).expect(201);

      expect(segundo.body.data.counts).toEqual({
        pending: 0,
        accepted: 0,
        duplicate: 3,
        skipped: 0,
      });
      // Se marca, no se borra: la fila sigue ahí para que la persona decida.
      expect(segundo.body.data.rows).toHaveLength(3);
      expect(segundo.body.data.rows[0].duplicate_of_id).toEqual(expect.any(Number));
    });

    it('reconoce el mismo movimiento aunque el banco lo escriba distinto', async () => {
      const primero = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${primero.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      const segundo = await importar(comoAna, {
        rows: [
          {
            ...FILAS[0],
            // Mismo comercio, otra grafía y con referencia: la normalización
            // tiene que reducirlo a lo mismo.
            description: 'COMPRA ÉXITO POBLADO REF 000998877',
          },
        ],
      }).expect(201);

      expect(segundo.body.data.rows[0].status).toBe('duplicate');
    });

    it('un centavo de diferencia NO es un duplicado', async () => {
      const primero = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${primero.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      const segundo = await importar(comoAna, {
        rows: [{ ...FILAS[0], amount: '45900.01' }],
      }).expect(201);

      expect(segundo.body.data.rows[0].status).toBe('accepted');
    });

    it('los movimientos de otra persona no cuentan como duplicados', async () => {
      const cuentaDeBeto = await crearCuenta(comoBeto);
      const deBeto = await http
        .post('/api/v1/imports')
        .set('Authorization', comoBeto)
        .send({ account_id: cuentaDeBeto.id, source: 'image', rows: FILAS })
        .expect(201);
      await http
        .post(`/api/v1/imports/${deBeto.body.data.id}/commit`)
        .set('Authorization', comoBeto)
        .expect(200);

      const deAna = await importar(comoAna).expect(201);
      expect(deAna.body.data.counts.duplicate).toBe(0);
    });
  });

  // ── Revisión ───────────────────────────────────────────────────────────────

  describe('Revisión', () => {
    it('permite corregir lo que el OCR leyó mal', async () => {
      const lote = await importar(comoAna).expect(201);
      const fila = lote.body.data.rows[0];

      const respuesta = await http
        .patch(`/api/v1/imports/${lote.body.data.id}/rows/${fila.id}`)
        .set('Authorization', comoAna)
        .send({ amount: '45.90', description: 'Exito Poblado corregido' })
        .expect(200);

      expect(respuesta.body.data).toMatchObject({
        amount: '45.90',
        description: 'Exito Poblado corregido',
      });
    });

    it('permite descartar una fila que no quiero importar', async () => {
      const lote = await importar(comoAna).expect(201);

      await http
        .patch(`/api/v1/imports/${lote.body.data.id}/rows/${lote.body.data.rows[0].id}`)
        .set('Authorization', comoAna)
        .send({ status: 'skipped' })
        .expect(200);

      const confirmado = await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      expect(confirmado.body.data.creados).toBe(2);
    });

    it('permite aceptar un duplicado señalado: el sistema informa, no decide', async () => {
      const primero = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${primero.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      const segundo = await importar(comoAna, { rows: [FILAS[0]] }).expect(201);
      expect(segundo.body.data.rows[0].status).toBe('duplicate');

      // Dos cafés iguales el mismo día son dos movimientos reales.
      await http
        .patch(`/api/v1/imports/${segundo.body.data.id}/rows/${segundo.body.data.rows[0].id}`)
        .set('Authorization', comoAna)
        .send({ status: 'accepted' })
        .expect(200);

      const confirmado = await http
        .post(`/api/v1/imports/${segundo.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);
      expect(confirmado.body.data.creados).toBe(1);
    });

    it('permite quitar la categoría: un movimiento sin categoría es válido', async () => {
      const lote = await importar(comoAna).expect(201);
      const fila = lote.body.data.rows[0];

      await http
        .patch(`/api/v1/imports/${lote.body.data.id}/rows/${fila.id}`)
        .set('Authorization', comoAna)
        .send({ category_id: mercado.id })
        .expect(200);

      const respuesta = await http
        .patch(`/api/v1/imports/${lote.body.data.id}/rows/${fila.id}`)
        .set('Authorization', comoAna)
        .send({ category_id: null })
        .expect(200);

      expect(respuesta.body.data.category_id).toBeNull();
    });

    it('rechaza una categoría ajena', async () => {
      const lote = await importar(comoAna).expect(201);
      const deBeto = await crearCategoria(comoBeto, 'Suya');

      await http
        .patch(`/api/v1/imports/${lote.body.data.id}/rows/${lote.body.data.rows[0].id}`)
        .set('Authorization', comoAna)
        .send({ category_id: deBeto.id })
        .expect(422);
    });

    it('un lote ajeno responde 404, no 403', async () => {
      const lote = await importar(comoAna).expect(201);
      await http
        .get(`/api/v1/imports/${lote.body.data.id}`)
        .set('Authorization', comoBeto)
        .expect(404);
    });
  });

  // ── Confirmación ───────────────────────────────────────────────────────────

  describe('Confirmación', () => {
    it('crea los movimientos y los deja consultables', async () => {
      const lote = await importar(comoAna).expect(201);

      const confirmado = await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      expect(confirmado.body.data.creados).toBe(3);
      expect(confirmado.body.data.lote.status).toBe('committed');
      expect(confirmado.body.data.lote.committed_at).not.toBeNull();

      const movimientos = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoAna)
        .expect(200);
      expect(movimientos.body.data).toHaveLength(3);
    });

    it('el saldo de la cuenta refleja lo importado, al centavo', async () => {
      const lote = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      const cuentas = await http
        .get('/api/v1/accounts')
        .set('Authorization', comoAna)
        .expect(200);

      // 0 − 45900.00 − 23500.00 − 12000.50
      expect(cuentas.body.data[0].balance).toBe('-81400.50');
    });

    // ── El control que impide duplicar por un reintento ──
    it('confirmar DOS veces no duplica nada', async () => {
      const lote = await importar(comoAna).expect(201);

      const primera = await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);
      const segunda = await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      expect(primera.body.data.creados).toBe(3);
      expect(segunda.body.data.creados).toBe(3);

      const movimientos = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoAna)
        .expect(200);
      expect(movimientos.body.data).toHaveLength(3);
    });

    it('rechaza confirmar cuando no queda ninguna fila aceptada', async () => {
      const lote = await importar(comoAna).expect(201);

      for (const fila of lote.body.data.rows) {
        await http
          .patch(`/api/v1/imports/${lote.body.data.id}/rows/${fila.id}`)
          .set('Authorization', comoAna)
          .send({ status: 'skipped' })
          .expect(200);
      }

      await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(400);
    });

    it('un lote confirmado ya no se puede editar', async () => {
      const lote = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      await http
        .patch(`/api/v1/imports/${lote.body.data.id}/rows/${lote.body.data.rows[0].id}`)
        .set('Authorization', comoAna)
        .send({ amount: '1.00' })
        .expect(409);
    });
  });

  // ── Deshacer ───────────────────────────────────────────────────────────────

  describe('Deshacer', () => {
    it('quita todos los movimientos que creó el lote, y solo esos', async () => {
      // Un movimiento previo que NO viene de la importación.
      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna)
        .send({
          account_id: cuenta.id,
          date: '2026-07-15',
          amount: '5000.00',
          type: 'expense',
          description: 'A mano',
        })
        .expect(201);

      const lote = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      const deshecho = await http
        .post(`/api/v1/imports/${lote.body.data.id}/undo`)
        .set('Authorization', comoAna)
        .expect(200);

      expect(deshecho.body.data.borrados).toBe(3);

      const movimientos = await http
        .get('/api/v1/transactions')
        .set('Authorization', comoAna)
        .expect(200);
      expect(movimientos.body.data).toHaveLength(1);
      expect(movimientos.body.data[0].description).toBe('A mano');
    });

    it('tras deshacer, el mismo extracto ya no se ve como duplicado', async () => {
      const lote = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);
      await http
        .post(`/api/v1/imports/${lote.body.data.id}/undo`)
        .set('Authorization', comoAna)
        .expect(200);

      const otraVez = await importar(comoAna).expect(201);
      expect(otraVez.body.data.counts.duplicate).toBe(0);
    });

    it('no se puede deshacer un borrador que nunca se confirmó', async () => {
      const lote = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${lote.body.data.id}/undo`)
        .set('Authorization', comoAna)
        .expect(409);
    });

    it('descartar un borrador lo borra entero', async () => {
      const lote = await importar(comoAna).expect(201);

      await http
        .delete(`/api/v1/imports/${lote.body.data.id}`)
        .set('Authorization', comoAna)
        .expect(204);

      await http
        .get(`/api/v1/imports/${lote.body.data.id}`)
        .set('Authorization', comoAna)
        .expect(404);
    });

    it('descartar NO sirve para un lote confirmado: para eso está deshacer', async () => {
      const lote = await importar(comoAna).expect(201);
      await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      await http
        .delete(`/api/v1/imports/${lote.body.data.id}`)
        .set('Authorization', comoAna)
        .expect(409);
    });
  });

  // ── Categorización automática (T1) ─────────────────────────────────────────

  describe('Categorización automática', () => {
    it('no sugiere nada cuando no hay historial', async () => {
      const lote = await importar(comoAna).expect(201);
      expect(lote.body.data.rows.every((f: { category_id: null }) => f.category_id === null)).toBe(
        true,
      );
    });

    it('aprende del historial y sugiere en la siguiente importación', async () => {
      // Ana clasifica tres compras de Rappi como Domicilios.
      for (const dia of ['10', '11', '12']) {
        await http
          .post('/api/v1/transactions')
          .set('Authorization', comoAna)
          .send({
            account_id: cuenta.id,
            date: `2026-07-${dia}`,
            amount: '20000.00',
            type: 'expense',
            category_id: domicilios.id,
            description: 'Rappi Comida',
          })
          .expect(201);
      }

      const lote = await importar(comoAna, {
        rows: [{ date: '2026-08-05', amount: '31000.00', type: 'expense', description: 'RAPPI*RESTAURANTE' }],
      }).expect(201);

      expect(lote.body.data.rows[0]).toMatchObject({
        category_id: domicilios.id,
        confidence: expect.any(Number),
      });
    });

    it('el endpoint de sugerencia responde con envelope aunque no haya nada que decir', async () => {
      const respuesta = await http
        .get('/api/v1/categorization/suggest?description=algo-desconocido')
        .set('Authorization', comoAna)
        .expect(200);

      expect(respuesta.body).toEqual({ data: null, meta: {} });
    });

    it('el endpoint de sugerencia usa el historial', async () => {
      await http
        .post('/api/v1/transactions')
        .set('Authorization', comoAna)
        .send({
          account_id: cuenta.id,
          date: '2026-07-10',
          amount: '50000.00',
          type: 'expense',
          category_id: mercado.id,
          description: 'Carulla Poblado',
        })
        .expect(201);

      const respuesta = await http
        .get('/api/v1/categorization/suggest?description=CARULLA%20CALLE%2010')
        .set('Authorization', comoAna)
        .expect(200);

      expect(respuesta.body.data).toMatchObject({
        category_id: mercado.id,
        reason: 'historial',
      });
    });

    it('confirmar un lote deja aprendida la categoría para la próxima vez', async () => {
      const lote = await importar(comoAna, {
        rows: [{ date: '2026-08-01', amount: '45900.00', type: 'expense', description: 'Almacen Flamingo' }],
      }).expect(201);

      await http
        .patch(`/api/v1/imports/${lote.body.data.id}/rows/${lote.body.data.rows[0].id}`)
        .set('Authorization', comoAna)
        .send({ category_id: mercado.id })
        .expect(200);

      await http
        .post(`/api/v1/imports/${lote.body.data.id}/commit`)
        .set('Authorization', comoAna)
        .expect(200);

      const siguiente = await importar(comoAna, {
        rows: [{ date: '2026-09-01', amount: '9900.00', type: 'expense', description: 'Almacen Flamingo Envigado' }],
      }).expect(201);

      expect(siguiente.body.data.rows[0].category_id).toBe(mercado.id);
    });
  });

  // ── Listado ────────────────────────────────────────────────────────────────

  describe('Listado de lotes', () => {
    it('devuelve el resumen sin arrastrar todas las filas', async () => {
      await importar(comoAna).expect(201);

      const respuesta = await http
        .get('/api/v1/imports')
        .set('Authorization', comoAna)
        .expect(200);

      expect(respuesta.body.data).toHaveLength(1);
      expect(respuesta.body.data[0].counts.accepted).toBe(3);
      expect(respuesta.body.data[0].rows).toBeUndefined();
    });

    it('no muestra los lotes de otra persona', async () => {
      await importar(comoAna).expect(201);

      const respuesta = await http
        .get('/api/v1/imports')
        .set('Authorization', comoBeto)
        .expect(200);

      expect(respuesta.body.data).toHaveLength(0);
    });
  });
});
