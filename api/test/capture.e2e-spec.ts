import request from 'supertest';

import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Phase 3 — the single brain (e2e).
 *
 * What cannot fail: that a text becomes a classified expense in ONE request;
 * that repeating the request does not create a second expense; that Wallet and
 * the SMS of the same payment end up in a single row; and that `interpret`
 * does not write.
 */
describe('Phase 3 — Interpret and capture (e2e)', () => {
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

    // A minimal tree: Costos variables › Alimentación › Mercado, and a
    // «Transporte» category with no concepts.
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

  describe('A bank SMS', () => {
    it('becomes a classified expense in a single request', async () => {
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

    it('repeated with the same external_ref creates no second expense, and answers the same', async () => {
      const first = await capture({ text: SMS, source: 'sms', externalRef: 'sms-002' });
      const second = await capture({ text: SMS, source: 'sms', externalRef: 'sms-002' });

      expect(second.status).toBe(200);
      expect(second.body.data.isDuplicate).toBe(true);
      expect(second.body.data.transaction.id).toBe(first.body.data.transaction.id);
      expect(await countTransactions()).toBe(1);
    });

    it('a merchant that leads to a category with no concept: saved with the category and for review', async () => {
      const r = await capture({
        text: 'UBER *TRIP $18.500 03/10/2026',
        source: 'sms',
        externalRef: 'sms-003',
      });

      expect(r.status).toBe(200);
      expect(r.body.data.classification.certainty).toBe('medium');
      expect(r.body.data.transaction.needsReview).toBe(true);
      // The category is set: it is already halfway in the right place.
      const transport = await env.prisma.category.findFirst({
        where: { userId: user.id, name: 'Transporte' },
      });
      expect(r.body.data.transaction.categoryId).toBe(Number(transport!.id));
      expect(r.body.data.summary).toContain('(por revisar)');
    });

    it('an unknown merchant is saved unclassified and for review: it never guesses', async () => {
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

  describe('Wallet and SMS of the same payment', () => {
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

    it('the SMS that arrives two minutes later MERGES with the Wallet transaction', async () => {
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
      // And the Wallet one was enriched with the SMS text, without losing its own.
      const onlyOne = await env.prisma.transaction.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(onlyOne.source).toBe('wallet');
      expect(onlyOne.merchant).toBe('Exito Poblado');
      expect(onlyOne.rawText).toContain('EXITO POBLADO');
      expect(sms.body.data.summary).toMatch(/^Era el mismo pago/);
    });

    it('a partial match —same amount, outside the window— creates the expense flagged for review', async () => {
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

    it('two captures from the SAME source never merge: two SMS are two purchases', async () => {
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

  describe('Interpret', () => {
    it('returns what it understood and writes NOTHING', async () => {
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

    it('without text or merchant, 422', async () => {
      const r = await interpret({});
      expect(r.status).toBe(422);
    });

    it('Wallet without an amount is interpreted all the same, and flagged', async () => {
      const r = await interpret({ merchant: 'Exito Poblado', date: '2026-10-02' });
      expect(r.status).toBe(200);
      expect(r.body.data.amount).toBeNull();
      expect(r.body.data.needsReview).toBe(true);
    });
  });

  describe('What the person chose on the phone', () => {
    const transportId = async () =>
      (
        await env.prisma.category.findFirstOrThrow({
          where: { userId: user.id, name: 'Transporte' },
        })
      ).id;

    it('the chosen concept OVERRIDES what the engine proposes', async () => {
      // The dictionary would send the Koba SMS to Mercado; the person said otherwise.
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
      // What was read from the text is kept.
      expect(r.body.data.transaction.amount).toBe('45000.00');
      expect(r.body.data.transaction.date).toBe('2026-10-03');
    });

    it('an ios_manual capture without text or merchant, with amount and concept, is created', async () => {
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

    it('without text, merchant or concept it is still 422', async () => {
      const r = await capture({ source: 'ios_manual', externalRef: 'e-3', amount: '12000' });
      expect(r.status).toBe(422);
      expect(await countTransactions()).toBe(0);
    });

    it('a category (depth 2) is saved with medium certainty and for review', async () => {
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

    it('a cost center classifies nothing: 422', async () => {
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

    it("an archived concept, or someone else's, is 422", async () => {
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

    it('the note is saved in notes, and without an amount the warning is added', async () => {
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

    it('Wallet with a date in Bogotá: the day is the one the app sends, not the UTC of captured_at', async () => {
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

    it('a non-numeric category id, 400', async () => {
      const r = await capture({
        source: 'ios_manual',
        externalRef: 'e-11',
        amount: '1000',
        categoryId: 'abc',
      });
      expect(r.status).toBe(400);
    });
  });

  describe('The transaction the web creates', () => {
    it('accepts the new columns and still works the same without them', async () => {
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
