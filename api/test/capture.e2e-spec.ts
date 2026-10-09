import request from 'supertest';

import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Fase 3 — el único cerebro (e2e).
 *
 * Lo que no puede fallar: que un texto se vuelva un gasto clasificado en UNA
 * petición; que repetir la petición no cree un segundo gasto; que Wallet y el
 * SMS del mismo pago acaben en una sola fila; y que `interpret` no escriba.
 */
describe('Fase 3 — Interpretar y capturar (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let user: TestUser;
  let groceriesId: bigint;

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
    user = await env.createUser();

    // Un árbol mínimo: Costos variables › Alimentación › Mercado, y una
    // categoría «Transporte» sin conceptos.
    const costCenter = await env.prisma.category.create({
      data: { userId: user.id, name: 'Costos variables', kind: 'expense' },
    });
    const food = await env.prisma.category.create({
      data: { userId: user.id, name: 'Alimentación', kind: 'expense', parentId: costCenter.id },
    });
    const groceries = await env.prisma.category.create({
      data: { userId: user.id, name: 'Mercado', kind: 'expense', parentId: food.id },
    });
    await env.prisma.category.create({
      data: { userId: user.id, name: 'Transporte', kind: 'expense', parentId: costCenter.id },
    });
    groceriesId = groceries.id;
  });

  const capture = (body: Record<string, unknown>) =>
    http.post('/api/v2/transactions/capture').set('Authorization', env.as(user)).send(body);

  const interpret = (body: Record<string, unknown>) =>
    http.post('/api/v2/transactions/interpret').set('Authorization', env.as(user)).send(body);

  const countTransactions = () => env.prisma.transaction.count({ where: { userId: user.id } });

  const SMS =
    'Bancolombia le informa compra por $45.000 en KOBA COLOMBIA el 03/10/2026 con tu tarjeta *1234';

  describe('Un SMS bancario', () => {
    it('se vuelve un gasto clasificado en una sola petición', async () => {
      const r = await capture({ text: SMS, source: 'sms', externalRef: 'sms-001' });

      expect(r.status).toBe(200);
      expect(r.body.data.isDuplicate).toBe(false);
      expect(r.body.data.isMerged).toBe(false);
      expect(r.body.data.transaction.categoryId).toBe(Number(groceriesId));
      expect(r.body.data.transaction.amount).toBe('45000.00');
      expect(r.body.data.transaction.date).toBe('2026-10-03');
      expect(r.body.data.transaction.source).toBe('sms');
      expect(r.body.data.transaction.rawText).toBe(SMS);
      expect(r.body.data.transaction.needsReview).toBe(false);
      expect(r.body.data.classification).toMatchObject({
        certainty: 'high',
        source: 'dictionary',
        name: 'Mercado',
      });
      expect(r.body.data.summary).toBe('Registrado: $45.000 · Mercado');
      expect(await countTransactions()).toBe(1);
    });

    it('repetido con el mismo external_ref no crea un segundo gasto, y contesta lo mismo', async () => {
      const first = await capture({ text: SMS, source: 'sms', externalRef: 'sms-002' });
      const second = await capture({ text: SMS, source: 'sms', externalRef: 'sms-002' });

      expect(second.status).toBe(200);
      expect(second.body.data.isDuplicate).toBe(true);
      expect(second.body.data.transaction.id).toBe(first.body.data.transaction.id);
      expect(await countTransactions()).toBe(1);
    });

    it('un comercio que lleva a una categoría sin concepto: se guarda con la categoría y por revisar', async () => {
      const r = await capture({
        text: 'UBER *TRIP $18.500 03/10/2026',
        source: 'sms',
        externalRef: 'sms-003',
      });

      expect(r.status).toBe(200);
      expect(r.body.data.classification.certainty).toBe('medium');
      expect(r.body.data.transaction.needsReview).toBe(true);
      // La categoría queda puesta: ya está en el sitio correcto a medias.
      const transport = await env.prisma.category.findFirst({
        where: { userId: user.id, name: 'Transporte' },
      });
      expect(r.body.data.transaction.categoryId).toBe(Number(transport!.id));
      expect(r.body.data.summary).toContain('(por revisar)');
    });

    it('un comercio desconocido se guarda sin clasificar y por revisar: nunca adivina', async () => {
      const r = await capture({
        text: 'FERRETERIA LA ESQUINA $80.000 03/10/2026',
        source: 'sms',
        externalRef: 'sms-004',
      });

      expect(r.status).toBe(200);
      expect(r.body.data.transaction.categoryId).toBeNull();
      expect(r.body.data.transaction.needsReview).toBe(true);
      expect(r.body.data.summary).toBe('Registrado: $80.000 · Pendiente de clasificar');
    });
  });

  describe('Wallet y SMS del mismo pago', () => {
    const t0 = new Date('2026-10-02T15:00:00-05:00');
    const later = (ms: number) => new Date(t0.getTime() + ms).toISOString();

    const wallet = () =>
      capture({
        merchant: 'Exito Poblado',
        amount: '120000',
        date: '2026-10-02',
        source: 'wallet',
        externalRef: 'w-1',
        capturedAt: t0.toISOString(),
      });

    it('el SMS que llega a los dos minutos se FUSIONA con la transacción de Wallet', async () => {
      await wallet();
      const sms = await capture({
        text: 'Bancolombia: compra por $120.000 en EXITO POBLADO el 02/10/2026',
        source: 'sms',
        externalRef: 's-1',
        capturedAt: later(2 * 60_000),
      });

      expect(sms.status).toBe(200);
      expect(sms.body.data.isMerged).toBe(true);
      expect(sms.body.data.isDuplicate).toBe(false);
      expect(await countTransactions()).toBe(1);
      // Y la de Wallet quedó enriquecida con el texto del SMS, sin perder lo suyo.
      const onlyOne = await env.prisma.transaction.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(onlyOne.source).toBe('wallet');
      expect(onlyOne.merchant).toBe('Exito Poblado');
      expect(onlyOne.rawText).toContain('EXITO POBLADO');
      expect(sms.body.data.summary).toMatch(/^Era el mismo pago/);
    });

    it('un parecido parcial —mismo monto, fuera de la ventana— crea el gasto marcado para revisar', async () => {
      await wallet();
      const sms = await capture({
        text: 'Bancolombia: compra por $120.000 en EXITO POBLADO el 02/10/2026',
        source: 'sms',
        externalRef: 's-2',
        capturedAt: later(45 * 60_000),
      });

      expect(sms.body.data.isMerged).toBe(false);
      expect(sms.body.data.transaction.needsReview).toBe(true);
      expect(await countTransactions()).toBe(2);
    });

    it('dos capturas del MISMO origen nunca se fusionan: dos SMS son dos compras', async () => {
      await capture({
        text: 'compra por $6.000 en TOSTAO 02/10/2026',
        source: 'sms',
        externalRef: 's-3',
        capturedAt: later(0),
      });
      const other = await capture({
        text: 'compra por $6.000 en TOSTAO 02/10/2026',
        source: 'sms',
        externalRef: 's-4',
        capturedAt: later(60_000),
      });

      expect(other.body.data.isMerged).toBe(false);
      expect(await countTransactions()).toBe(2);
    });
  });

  describe('Interpretar', () => {
    it('devuelve lo entendido y NO escribe nada', async () => {
      const before = await countTransactions();
      const r = await interpret({ text: SMS });

      expect(r.status).toBe(200);
      expect(r.body.data.amount).toBe('45000');
      expect(r.body.data.date).toBe('2026-10-03');
      expect(r.body.data.classification).toMatchObject({
        certainty: 'high',
        conceptId: Number(groceriesId),
        name: 'Mercado',
      });
      expect(r.body.data.needsReview).toBe(false);
      expect(await countTransactions()).toBe(before);
    });

    it('sin texto ni comercio, 422', async () => {
      const r = await interpret({});
      expect(r.status).toBe(422);
    });

    it('Wallet sin monto se interpreta igual, y se marca', async () => {
      const r = await interpret({ merchant: 'Exito Poblado', date: '2026-10-02' });
      expect(r.status).toBe(200);
      expect(r.body.data.amount).toBeNull();
      expect(r.body.data.needsReview).toBe(true);
    });
  });

  describe('Lo que la persona eligió en el teléfono', () => {
    const transportId = async () =>
      (
        await env.prisma.category.findFirstOrThrow({
          where: { userId: user.id, name: 'Transporte' },
        })
      ).id;

    it('el concepto elegido MANDA sobre lo que propone el motor', async () => {
      // El diccionario llevaría el SMS de Koba a Mercado; la persona dijo otra cosa.
      const transport = await transportId();
      const taxi = await env.prisma.category.create({
        data: { userId: user.id, name: 'Taxi', kind: 'expense', parentId: transport },
      });
      const r = await capture({
        text: SMS,
        source: 'sms',
        externalRef: 'e-1',
        categoryId: String(taxi.id),
      });

      expect(r.status).toBe(200);
      expect(r.body.data.transaction.categoryId).toBe(Number(taxi.id));
      expect(r.body.data.transaction.needsReview).toBe(false);
      expect(r.body.data.classification).toMatchObject({
        certainty: 'high',
        source: null,
        name: 'Taxi',
        reason: 'Lo eligió la persona.',
      });
      // Lo leído del texto se conserva.
      expect(r.body.data.transaction.amount).toBe('45000.00');
      expect(r.body.data.transaction.date).toBe('2026-10-03');
    });

    it('una captura ios_manual sin texto ni comercio, con monto y concepto, se crea', async () => {
      const r = await capture({
        source: 'ios_manual',
        externalRef: 'e-2',
        amount: '12000',
        date: '2026-10-03',
        categoryId: String(groceriesId),
      });

      expect(r.status).toBe(200);
      expect(r.body.data.transaction.categoryId).toBe(Number(groceriesId));
      expect(r.body.data.transaction.amount).toBe('12000.00');
      expect(r.body.data.transaction.date).toBe('2026-10-03');
      expect(r.body.data.transaction.merchant).toBeNull();
      expect(r.body.data.transaction.needsReview).toBe(false);
      expect(r.body.data.summary).toBe('Registrado: $12.000 · Mercado');
      expect(await countTransactions()).toBe(1);
    });

    it('sin texto, sin comercio y sin concepto sigue siendo 422', async () => {
      const r = await capture({ source: 'ios_manual', externalRef: 'e-3', amount: '12000' });
      expect(r.status).toBe(422);
      expect(await countTransactions()).toBe(0);
    });

    it('una categoría (profundidad 2) se guarda con certeza media y por revisar', async () => {
      const transport = await transportId();
      const r = await capture({
        source: 'ios_manual',
        externalRef: 'e-4',
        amount: '18500',
        categoryId: String(transport),
      });

      expect(r.status).toBe(200);
      expect(r.body.data.transaction.categoryId).toBe(Number(transport));
      expect(r.body.data.transaction.needsReview).toBe(true);
      expect(r.body.data.classification).toMatchObject({
        certainty: 'medium',
        conceptId: null,
        categoryId: Number(transport),
      });
      expect(r.body.data.summary).toContain('(por revisar)');
    });

    it('un centro de costos no clasifica nada: 422', async () => {
      const costCenter = await env.prisma.category.findFirstOrThrow({
        where: { userId: user.id, name: 'Costos variables' },
      });
      const r = await capture({
        source: 'ios_manual',
        externalRef: 'e-5',
        amount: '1000',
        categoryId: String(costCenter.id),
      });
      expect(r.status).toBe(422);
      expect(await countTransactions()).toBe(0);
    });

    it('un concepto archivado, o de otra persona, es 422', async () => {
      await env.prisma.category.update({
        where: { id: groceriesId },
        data: { isArchived: true },
      });
      const archived = await capture({
        source: 'ios_manual',
        externalRef: 'e-6',
        amount: '1000',
        categoryId: String(groceriesId),
      });
      expect(archived.status).toBe(422);

      const other = await env.createUser();
      const foreignCostCenter = await env.prisma.category.create({
        data: { userId: other.id, name: 'Ajeno', kind: 'expense' },
      });
      const foreignCategory = await env.prisma.category.create({
        data: { userId: other.id, name: 'Cat', kind: 'expense', parentId: foreignCostCenter.id },
      });
      const foreignConcept = await env.prisma.category.create({
        data: { userId: other.id, name: 'Con', kind: 'expense', parentId: foreignCategory.id },
      });
      const foreign = await capture({
        source: 'ios_manual',
        externalRef: 'e-7',
        amount: '1000',
        categoryId: String(foreignConcept.id),
      });
      expect(foreign.status).toBe(422);
      expect(await countTransactions()).toBe(0);
    });

    it('la nota se guarda en notes, y sin monto se le añade el aviso', async () => {
      const withAmount = await capture({
        source: 'ios_manual',
        externalRef: 'e-8',
        amount: '1000',
        categoryId: String(groceriesId),
        note: 'Para la semana',
      });
      expect(withAmount.status).toBe(200);
      expect(withAmount.body.data.transaction.notes).toBe('Para la semana');

      const withoutAmount = await capture({
        source: 'wallet',
        externalRef: 'e-9',
        merchant: 'Exito Poblado',
        categoryId: String(groceriesId),
        note: 'Sin ticket',
      });
      expect(withoutAmount.status).toBe(200);
      expect(withoutAmount.body.data.transaction.notes).toBe(
        'Sin ticket\nCapturado sin valor: hay que ponerlo.',
      );
    });

    it('Wallet con fecha en Bogotá: el día es el que manda la app, no el UTC de captured_at', async () => {
      const r = await capture({
        source: 'wallet',
        externalRef: 'e-10',
        merchant: 'Exito Poblado',
        amount: '5000',
        date: '2026-10-03',
        capturedAt: '2026-10-04T04:30:00Z',
      });
      expect(r.status).toBe(200);
      expect(r.body.data.transaction.date).toBe('2026-10-03');
    });

    it('un id de categoría que no es numérico, 400', async () => {
      const r = await capture({
        source: 'ios_manual',
        externalRef: 'e-11',
        amount: '1000',
        categoryId: 'abc',
      });
      expect(r.status).toBe(400);
    });
  });

  describe('El movimiento que crea la web', () => {
    it('acepta las columnas nuevas y sigue funcionando igual sin ellas', async () => {
      const withNothing = await http
        .post('/api/v2/transactions')
        .set('Authorization', env.as(user))
        .send({ date: '2026-10-01', amount: '10000', type: 'expense' });
      expect(withNothing.status).toBe(201);
      expect(withNothing.body.data.source).toBe('web');
      expect(withNothing.body.data.needsReview).toBe(false);
      expect(withNothing.body.data.rawText).toBeNull();

      const withEverything = await http
        .post('/api/v2/transactions')
        .set('Authorization', env.as(user))
        .send({
          date: '2026-10-01',
          amount: '10000',
          type: 'expense',
          source: 'web',
          rawText: 'KOBA COLOMBIA',
          capturedAt: '2026-10-01T10:00:00-05:00',
          needsReview: true,
        });
      expect(withEverything.status).toBe(201);
      expect(withEverything.body.data.rawText).toBe('KOBA COLOMBIA');
      expect(withEverything.body.data.needsReview).toBe(true);
    });
  });
});
