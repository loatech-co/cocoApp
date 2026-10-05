import request from 'supertest';

import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

/**
 * Fase 3 — el único cerebro (e2e).
 *
 * Lo que no puede fallar: que un texto se vuelva un gasto clasificado en UNA
 * petición; que repetir la petición no cree un segundo gasto; que Wallet y el
 * SMS del mismo pago acaben en una sola fila; y que `interpret` no escriba.
 */
describe('Fase 3 — Interpretar y capturar (e2e)', () => {
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let usuario: UsuarioDePrueba;
  let mercadoId: bigint;

  beforeAll(async () => {
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  beforeEach(async () => {
    await entorno.limpiar();
    usuario = await entorno.crearUsuario();

    // Un árbol mínimo: Costos variables › Alimentación › Mercado, y una
    // categoría «Transporte» sin conceptos.
    const centro = await entorno.prisma.category.create({
      data: { userId: usuario.id, name: 'Costos variables', kind: 'expense' },
    });
    const alimentacion = await entorno.prisma.category.create({
      data: { userId: usuario.id, name: 'Alimentación', kind: 'expense', parentId: centro.id },
    });
    const mercado = await entorno.prisma.category.create({
      data: { userId: usuario.id, name: 'Mercado', kind: 'expense', parentId: alimentacion.id },
    });
    await entorno.prisma.category.create({
      data: { userId: usuario.id, name: 'Transporte', kind: 'expense', parentId: centro.id },
    });
    mercadoId = mercado.id;
  });

  const capturar = (body: Record<string, unknown>) =>
    http
      .post('/api/v1/transactions/capture')
      .set('Authorization', entorno.como(usuario))
      .send(body);

  const interpretar = (body: Record<string, unknown>) =>
    http
      .post('/api/v1/transactions/interpret')
      .set('Authorization', entorno.como(usuario))
      .send(body);

  const cuantas = () => entorno.prisma.transaction.count({ where: { userId: usuario.id } });

  const SMS =
    'Bancolombia le informa compra por $45.000 en KOBA COLOMBIA el 03/10/2026 con tu tarjeta *1234';

  describe('Un SMS bancario', () => {
    it('se vuelve un gasto clasificado en una sola petición', async () => {
      const r = await capturar({ texto: SMS, source: 'sms', external_ref: 'sms-001' });

      expect(r.status).toBe(200);
      expect(r.body.data.repetido).toBe(false);
      expect(r.body.data.fusionado).toBe(false);
      expect(r.body.data.transaction.category_id).toBe(Number(mercadoId));
      expect(r.body.data.transaction.amount).toBe('45000.00');
      expect(r.body.data.transaction.date).toBe('2026-10-03');
      expect(r.body.data.transaction.source).toBe('sms');
      expect(r.body.data.transaction.raw_text).toBe(SMS);
      expect(r.body.data.transaction.por_revisar).toBe(false);
      expect(r.body.data.clasificacion).toMatchObject({
        certeza: 'alta',
        fuente: 'diccionario',
        nombre: 'Mercado',
      });
      expect(r.body.data.resumen).toBe('Registrado: $45.000 · Mercado');
      expect(await cuantas()).toBe(1);
    });

    it('repetido con el mismo external_ref no crea un segundo gasto, y contesta lo mismo', async () => {
      const primera = await capturar({ texto: SMS, source: 'sms', external_ref: 'sms-002' });
      const segunda = await capturar({ texto: SMS, source: 'sms', external_ref: 'sms-002' });

      expect(segunda.status).toBe(200);
      expect(segunda.body.data.repetido).toBe(true);
      expect(segunda.body.data.transaction.id).toBe(primera.body.data.transaction.id);
      expect(await cuantas()).toBe(1);
    });

    it('un comercio que lleva a una categoría sin concepto: se guarda con la categoría y por revisar', async () => {
      const r = await capturar({
        texto: 'UBER *TRIP $18.500 03/10/2026',
        source: 'sms',
        external_ref: 'sms-003',
      });

      expect(r.status).toBe(200);
      expect(r.body.data.clasificacion.certeza).toBe('media');
      expect(r.body.data.transaction.por_revisar).toBe(true);
      // La categoría queda puesta: ya está en el sitio correcto a medias.
      const transporte = await entorno.prisma.category.findFirst({
        where: { userId: usuario.id, name: 'Transporte' },
      });
      expect(r.body.data.transaction.category_id).toBe(Number(transporte!.id));
      expect(r.body.data.resumen).toContain('(por revisar)');
    });

    it('un comercio desconocido se guarda sin clasificar y por revisar: nunca adivina', async () => {
      const r = await capturar({
        texto: 'FERRETERIA LA ESQUINA $80.000 03/10/2026',
        source: 'sms',
        external_ref: 'sms-004',
      });

      expect(r.status).toBe(200);
      expect(r.body.data.transaction.category_id).toBeNull();
      expect(r.body.data.transaction.por_revisar).toBe(true);
      expect(r.body.data.resumen).toBe('Registrado: $80.000 · Pendiente de clasificar');
    });
  });

  describe('Wallet y SMS del mismo pago', () => {
    const t0 = new Date('2026-10-02T15:00:00-05:00');
    const masTarde = (ms: number) => new Date(t0.getTime() + ms).toISOString();

    const wallet = () =>
      capturar({
        comercio: 'Exito Poblado',
        monto: '120000',
        fecha: '2026-10-02',
        source: 'wallet',
        external_ref: 'w-1',
        captured_at: t0.toISOString(),
      });

    it('el SMS que llega a los dos minutos se FUSIONA con la transacción de Wallet', async () => {
      await wallet();
      const sms = await capturar({
        texto: 'Bancolombia: compra por $120.000 en EXITO POBLADO el 02/10/2026',
        source: 'sms',
        external_ref: 's-1',
        captured_at: masTarde(2 * 60_000),
      });

      expect(sms.status).toBe(200);
      expect(sms.body.data.fusionado).toBe(true);
      expect(sms.body.data.repetido).toBe(false);
      expect(await cuantas()).toBe(1);
      // Y la de Wallet quedó enriquecida con el texto del SMS, sin perder lo suyo.
      const unica = await entorno.prisma.transaction.findFirstOrThrow({
        where: { userId: usuario.id },
      });
      expect(unica.source).toBe('wallet');
      expect(unica.merchant).toBe('Exito Poblado');
      expect(unica.rawText).toContain('EXITO POBLADO');
      expect(sms.body.data.resumen).toMatch(/^Era el mismo pago/);
    });

    it('un parecido parcial —mismo monto, fuera de la ventana— crea el gasto marcado para revisar', async () => {
      await wallet();
      const sms = await capturar({
        texto: 'Bancolombia: compra por $120.000 en EXITO POBLADO el 02/10/2026',
        source: 'sms',
        external_ref: 's-2',
        captured_at: masTarde(45 * 60_000),
      });

      expect(sms.body.data.fusionado).toBe(false);
      expect(sms.body.data.transaction.por_revisar).toBe(true);
      expect(await cuantas()).toBe(2);
    });

    it('dos capturas del MISMO origen nunca se fusionan: dos SMS son dos compras', async () => {
      await capturar({
        texto: 'compra por $6.000 en TOSTAO 02/10/2026',
        source: 'sms',
        external_ref: 's-3',
        captured_at: masTarde(0),
      });
      const otra = await capturar({
        texto: 'compra por $6.000 en TOSTAO 02/10/2026',
        source: 'sms',
        external_ref: 's-4',
        captured_at: masTarde(60_000),
      });

      expect(otra.body.data.fusionado).toBe(false);
      expect(await cuantas()).toBe(2);
    });
  });

  describe('Interpretar', () => {
    it('devuelve lo entendido y NO escribe nada', async () => {
      const antes = await cuantas();
      const r = await interpretar({ texto: SMS });

      expect(r.status).toBe(200);
      expect(r.body.data.amount).toBe('45000');
      expect(r.body.data.date).toBe('2026-10-03');
      expect(r.body.data.clasificacion).toMatchObject({
        certeza: 'alta',
        concepto_id: Number(mercadoId),
        nombre: 'Mercado',
      });
      expect(r.body.data.por_revisar).toBe(false);
      expect(await cuantas()).toBe(antes);
    });

    it('sin texto ni comercio, 422', async () => {
      const r = await interpretar({});
      expect(r.status).toBe(422);
    });

    it('Wallet sin monto se interpreta igual, y se marca', async () => {
      const r = await interpretar({ comercio: 'Exito Poblado', fecha: '2026-10-02' });
      expect(r.status).toBe(200);
      expect(r.body.data.amount).toBeNull();
      expect(r.body.data.por_revisar).toBe(true);
    });
  });

  describe('Lo que la persona eligió en el teléfono', () => {
    const transporteId = async () =>
      (
        await entorno.prisma.category.findFirstOrThrow({
          where: { userId: usuario.id, name: 'Transporte' },
        })
      ).id;

    it('el concepto elegido MANDA sobre lo que propone el motor', async () => {
      // El diccionario llevaría el SMS de Koba a Mercado; la persona dijo otra cosa.
      const transporte = await transporteId();
      const taxi = await entorno.prisma.category.create({
        data: { userId: usuario.id, name: 'Taxi', kind: 'expense', parentId: transporte },
      });
      const r = await capturar({
        texto: SMS,
        source: 'sms',
        external_ref: 'e-1',
        category_id: String(taxi.id),
      });

      expect(r.status).toBe(200);
      expect(r.body.data.transaction.category_id).toBe(Number(taxi.id));
      expect(r.body.data.transaction.por_revisar).toBe(false);
      expect(r.body.data.clasificacion).toMatchObject({
        certeza: 'alta',
        fuente: null,
        nombre: 'Taxi',
        motivo: 'Lo eligió la persona.',
      });
      // Lo leído del texto se conserva.
      expect(r.body.data.transaction.amount).toBe('45000.00');
      expect(r.body.data.transaction.date).toBe('2026-10-03');
    });

    it('una captura ios_manual sin texto ni comercio, con monto y concepto, se crea', async () => {
      const r = await capturar({
        source: 'ios_manual',
        external_ref: 'e-2',
        monto: '12000',
        fecha: '2026-10-03',
        category_id: String(mercadoId),
      });

      expect(r.status).toBe(200);
      expect(r.body.data.transaction.category_id).toBe(Number(mercadoId));
      expect(r.body.data.transaction.amount).toBe('12000.00');
      expect(r.body.data.transaction.date).toBe('2026-10-03');
      expect(r.body.data.transaction.merchant).toBeNull();
      expect(r.body.data.transaction.por_revisar).toBe(false);
      expect(r.body.data.resumen).toBe('Registrado: $12.000 · Mercado');
      expect(await cuantas()).toBe(1);
    });

    it('sin texto, sin comercio y sin concepto sigue siendo 422', async () => {
      const r = await capturar({ source: 'ios_manual', external_ref: 'e-3', monto: '12000' });
      expect(r.status).toBe(422);
      expect(await cuantas()).toBe(0);
    });

    it('una categoría (profundidad 2) se guarda con certeza media y por revisar', async () => {
      const transporte = await transporteId();
      const r = await capturar({
        source: 'ios_manual',
        external_ref: 'e-4',
        monto: '18500',
        category_id: String(transporte),
      });

      expect(r.status).toBe(200);
      expect(r.body.data.transaction.category_id).toBe(Number(transporte));
      expect(r.body.data.transaction.por_revisar).toBe(true);
      expect(r.body.data.clasificacion).toMatchObject({
        certeza: 'media',
        concepto_id: null,
        categoria_id: Number(transporte),
      });
      expect(r.body.data.resumen).toContain('(por revisar)');
    });

    it('un centro de costos no clasifica nada: 422', async () => {
      const centro = await entorno.prisma.category.findFirstOrThrow({
        where: { userId: usuario.id, name: 'Costos variables' },
      });
      const r = await capturar({
        source: 'ios_manual',
        external_ref: 'e-5',
        monto: '1000',
        category_id: String(centro.id),
      });
      expect(r.status).toBe(422);
      expect(await cuantas()).toBe(0);
    });

    it('un concepto archivado, o de otra persona, es 422', async () => {
      await entorno.prisma.category.update({
        where: { id: mercadoId },
        data: { isArchived: true },
      });
      const archivado = await capturar({
        source: 'ios_manual',
        external_ref: 'e-6',
        monto: '1000',
        category_id: String(mercadoId),
      });
      expect(archivado.status).toBe(422);

      const otra = await entorno.crearUsuario();
      const centroAjeno = await entorno.prisma.category.create({
        data: { userId: otra.id, name: 'Ajeno', kind: 'expense' },
      });
      const categoriaAjena = await entorno.prisma.category.create({
        data: { userId: otra.id, name: 'Cat', kind: 'expense', parentId: centroAjeno.id },
      });
      const conceptoAjeno = await entorno.prisma.category.create({
        data: { userId: otra.id, name: 'Con', kind: 'expense', parentId: categoriaAjena.id },
      });
      const ajeno = await capturar({
        source: 'ios_manual',
        external_ref: 'e-7',
        monto: '1000',
        category_id: String(conceptoAjeno.id),
      });
      expect(ajeno.status).toBe(422);
      expect(await cuantas()).toBe(0);
    });

    it('la nota se guarda en notes, y sin monto se le añade el aviso', async () => {
      const conMonto = await capturar({
        source: 'ios_manual',
        external_ref: 'e-8',
        monto: '1000',
        category_id: String(mercadoId),
        nota: 'Para la semana',
      });
      expect(conMonto.status).toBe(200);
      expect(conMonto.body.data.transaction.notes).toBe('Para la semana');

      const sinMonto = await capturar({
        source: 'wallet',
        external_ref: 'e-9',
        comercio: 'Exito Poblado',
        category_id: String(mercadoId),
        nota: 'Sin ticket',
      });
      expect(sinMonto.status).toBe(200);
      expect(sinMonto.body.data.transaction.notes).toBe(
        'Sin ticket\nCapturado sin valor: hay que ponerlo.',
      );
    });

    it('Wallet con fecha en Bogotá: el día es el que manda la app, no el UTC de captured_at', async () => {
      const r = await capturar({
        source: 'wallet',
        external_ref: 'e-10',
        comercio: 'Exito Poblado',
        monto: '5000',
        fecha: '2026-10-03',
        captured_at: '2026-10-04T04:30:00Z',
      });
      expect(r.status).toBe(200);
      expect(r.body.data.transaction.date).toBe('2026-10-03');
    });

    it('un id de categoría que no es numérico, 400', async () => {
      const r = await capturar({
        source: 'ios_manual',
        external_ref: 'e-11',
        monto: '1000',
        category_id: 'abc',
      });
      expect(r.status).toBe(400);
    });
  });

  describe('El movimiento que crea la web', () => {
    it('acepta las columnas nuevas y sigue funcionando igual sin ellas', async () => {
      const sinNada = await http
        .post('/api/v1/transactions')
        .set('Authorization', entorno.como(usuario))
        .send({ date: '2026-10-01', amount: '10000', type: 'expense' });
      expect(sinNada.status).toBe(201);
      expect(sinNada.body.data.source).toBe('web');
      expect(sinNada.body.data.por_revisar).toBe(false);
      expect(sinNada.body.data.raw_text).toBeNull();

      const conTodo = await http
        .post('/api/v1/transactions')
        .set('Authorization', entorno.como(usuario))
        .send({
          date: '2026-10-01',
          amount: '10000',
          type: 'expense',
          source: 'web',
          raw_text: 'KOBA COLOMBIA',
          captured_at: '2026-10-01T10:00:00-05:00',
          por_revisar: true,
        });
      expect(conTodo.status).toBe(201);
      expect(conTodo.body.data.raw_text).toBe('KOBA COLOMBIA');
      expect(conTodo.body.data.por_revisar).toBe(true);
    });
  });
});
