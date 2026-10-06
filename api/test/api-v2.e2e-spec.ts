import request from 'supertest';

import { makeAccount, makeConcept } from './factories';
import {
  levantarApp,
  PASSWORD_VALIDA,
  type EntornoDePruebas,
  type UsuarioDePrueba,
} from './helpers/app';
import { PNG } from './helpers/isolation';

/**
 * The v2 contract, end to end: English and camelCase on the wire, every list a
 * page, the inputs reaching the services with the right names and words, the
 * capture idempotent, and both kinds of session.
 */
describe('API v2 (e2e)', () => {
  let env: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let user: UsuarioDePrueba;
  let auth: string;
  let conceptId: bigint;
  let groupId: bigint;
  let accountId: bigint;

  beforeAll(async () => {
    env = await levantarApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.cerrar();
  });

  beforeEach(async () => {
    await env.limpiar();
    user = await env.crearUsuario({ displayName: 'Vera' });
    auth = env.como(user);
    const tree = await makeConcept(env.prisma, user.id, {
      center: { name: 'Hogar', isStatic: true },
      category: { name: 'Servicios' },
      concept: {
        name: 'Internet',
        isRecurring: true,
        periodicity: 'quarterly',
        paymentDay: 5,
        paymentMonth: 2,
        budget: '90000',
        keywords: ['fibra'],
      },
    });
    conceptId = tree.concept.id;
    groupId = tree.category.id;
    accountId = (await makeAccount(env.prisma, user.id, { name: 'Débito', type: 'debit' })).id;
    await env.prisma.userPreference.create({
      data: { userId: user.id, prefKey: 'cuentas_habilitadas', prefValue: true },
    });
  });

  const v2 = (path: string) => http.get(`/api/v2${path}`).set('Authorization', auth);

  /** Some transactions, with everything a transaction can carry. */
  async function seedTransactions(): Promise<string> {
    const created = await http
      .post('/api/v2/transactions')
      .set('Authorization', auth)
      .send({
        date: '2026-09-03',
        amount: '45000',
        type: 'expense',
        accountId: Number(accountId),
        categoryId: Number(conceptId),
        merchant: 'Fibra SAS',
        description: 'Internet de septiembre',
        tags: ['casa'],
        needsReview: true,
        externalRef: 'ref-1',
        splits: [{ categoryId: Number(conceptId), amount: '45000', note: 'todo' }],
      })
      .expect(201);
    await http
      .post('/api/v2/transactions')
      .set('Authorization', auth)
      .send({ date: '2026-08-15', amount: '12000', type: 'income' })
      .expect(201);
    return String(created.body.data.id);
  }

  describe('reads', () => {
    it('speak English and camelCase, with the closed words in English', async () => {
      const transactionId = await seedTransactions();
      await http
        .post(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', auth)
        .attach('files', PNG, { filename: 'factura.png', contentType: 'image/png' })
        .expect(201);
      await http
        .post('/api/v2/categorization/learn')
        .set('Authorization', auth)
        .send({ description: 'Fibra SAS internet', categoryId: Number(conceptId) })
        .expect(201);

      const read = async (path: string): Promise<Record<string, unknown>> => {
        const response = await v2(path).expect(200);
        expect(response.body.meta).toEqual({});
        return response.body.data as Record<string, unknown>;
      };

      expect(await read(`/transactions/${transactionId}`)).toMatchObject({
        accountId: Number(accountId),
        categoryId: Number(conceptId),
        needsReview: true,
        externalRef: 'ref-1',
        tags: ['casa'],
        splits: [{ categoryId: Number(conceptId), amount: '45000.00', note: 'todo' }],
      });
      expect(await read('/transactions/history')).toEqual({
        first: '2026-08-01',
        last: '2026-09-01',
      });
      expect(await read(`/accounts/${String(accountId)}`)).toMatchObject({
        name: 'Débito',
        isArchived: false,
      });
      expect(await read(`/categories/${String(conceptId)}`)).toMatchObject({
        isRecurring: true,
        periodicity: 'quarterly',
        paymentDay: 5,
        paymentMonth: 2,
        budget: '90000',
        keywords: ['fibra'],
      });
      expect(await read(`/categories/${String(groupId)}/usage`)).toEqual({
        transactions: expect.any(Number),
        subcategories: 1,
      });
      expect(await read('/preferences')).toEqual({ accountsEnabled: true });
      expect(await read('/dashboard?from=2026-08-01&to=2026-09-30')).toMatchObject({
        breakdownLevel: 'concept',
      });
      // The search reaches what hangs from a category with that name.
      const searched = await read('/dashboard?from=2026-08-01&to=2026-09-30&q=servicios');
      expect(searched).toMatchObject({
        byCategory: [expect.objectContaining({ name: 'Internet' })],
      });
      expect(
        await read('/categorization/suggest?description=Fibra%20SAS%20internet'),
      ).toMatchObject({ categoryId: Number(conceptId), reason: 'history' });
      expect(await read('/auth/me')).toMatchObject({ displayName: 'Vera', role: 'user' });
    });

    it('every list is a page', async () => {
      const transactionId = await seedTransactions();
      await http
        .post(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', auth)
        .attach('files', PNG, { filename: 'factura.png', contentType: 'image/png' })
        .expect(201);

      const transactions = await v2('/transactions?perPage=1&page=2&sort=-amount').expect(200);
      expect(transactions.body.meta).toMatchObject({ page: 2, perPage: 1, total: 2 });
      expect(transactions.body.data).toEqual([expect.objectContaining({ amount: '12000.00' })]);

      for (const path of [
        '/accounts',
        '/tags',
        '/categories',
        `/transactions/${transactionId}/receipts`,
      ]) {
        const list = await v2(path).expect(200);
        expect({ path, meta: list.body.meta }).toEqual({
          path,
          meta: { page: 1, perPage: 50, total: 1 },
        });
      }
    });

    it('a page is cut where it says, and a page too large is refused in Spanish', async () => {
      await seedTransactions();
      const second = await v2('/accounts?perPage=1&page=2').expect(200);
      expect(second.body.meta).toEqual({ page: 2, perPage: 1, total: 1 });
      expect(second.body.data).toEqual([]);

      const tooLarge = await v2('/tags?perPage=201').expect(400);
      expect(tooLarge.body.code).toBe('invalid_fields');
      expect(tooLarge.body.errors).toEqual([{ field: 'perPage', message: expect.any(String) }]);
    });

    it('the tree is paged by its cost centers, each with what hangs from it', async () => {
      const tree = await v2('/categories').expect(200);
      expect(tree.body.meta).toEqual({ page: 1, perPage: 50, total: 1 });
      const internet = tree.body.data[0].children[0].children[0];
      expect(internet).toMatchObject({
        name: 'Internet',
        isRecurring: true,
        periodicity: 'quarterly',
        paymentDay: 5,
        paymentMonth: 2,
        budget: '90000',
        keywords: ['fibra'],
        children: [],
      });
      expect(tree.body.data[0].isStatic).toBe(true);
    });
  });

  describe('inputs reach the services with their names and words', () => {
    it('a transaction is written with every field it can carry', async () => {
      const created = await http
        .post('/api/v2/transactions')
        .set('Authorization', auth)
        .send({
          date: '2026-09-20',
          amount: '30000',
          type: 'expense',
          accountId: Number(accountId),
          categoryId: Number(conceptId),
          merchant: 'Fibra SAS',
          needsReview: true,
          rawText: 'texto del recibo',
          capturedAt: '2026-09-20T10:00:00-05:00',
          externalRef: 'v2-ref-1',
          tags: ['casa'],
          splits: [{ categoryId: Number(conceptId), amount: '30000', note: 'todo' }],
        })
        .expect(201);
      const id = String(created.body.data.id);

      const read = await v2(`/transactions/${id}`).expect(200);
      expect(read.body.data).toMatchObject({
        accountId: Number(accountId),
        categoryId: Number(conceptId),
        needsReview: true,
        rawText: 'texto del recibo',
        externalRef: 'v2-ref-1',
        tags: ['casa'],
        splits: [{ categoryId: Number(conceptId), amount: '30000.00', note: 'todo' }],
      });
      expect(created.body.data).toEqual(read.body.data);

      // `null` clears the category; an absent field is left alone.
      const cleared = await http
        .patch(`/api/v2/transactions/${id}`)
        .set('Authorization', auth)
        .send({ categoryId: null })
        .expect(200);
      expect(cleared.body.data.categoryId).toBeNull();
      expect(cleared.body.data.merchant).toBe('Fibra SAS');

      // The same externalRef again through the plain create route is a conflict.
      const again = await http
        .post('/api/v2/transactions')
        .set('Authorization', auth)
        .send({ date: '2026-09-20', amount: '1', externalRef: 'v2-ref-1' });
      expect(again.status).toBe(409);
    });

    it('a category keeps what it was written with', async () => {
      const created = await http
        .post('/api/v2/categories')
        .set('Authorization', auth)
        .send({
          name: 'Seguro',
          kind: 'expense',
          parentId: Number(groupId),
          isRecurring: true,
          periodicity: 'annual',
          paymentDay: 10,
          paymentMonth: 3,
          budget: 1200000,
          isAutoPaid: false,
          isMultiPayment: true,
          keywords: ['poliza', 'poliza', 'seguro'],
        })
        .expect(201);
      const id = String(created.body.data.id);
      expect(created.body.data).toMatchObject({ parentId: Number(groupId), periodicity: 'annual' });

      const read = await v2(`/categories/${id}`).expect(200);
      expect(read.body.data).toMatchObject({
        parentId: Number(groupId),
        isRecurring: true,
        periodicity: 'annual',
        paymentDay: 10,
        paymentMonth: 3,
        budget: '1200000',
        isAutoPaid: false,
        isMultiPayment: true,
        keywords: ['poliza', 'seguro'],
      });

      const renamed = await http
        .patch(`/api/v2/categories/${id}`)
        .set('Authorization', auth)
        .send({
          isRecurring: false,
          isMultiPayment: false,
          periodicity: null,
          paymentDay: null,
          paymentMonth: null,
          sortOrder: 4,
        })
        .expect(200);
      expect(renamed.body.data).toMatchObject({
        isRecurring: false,
        periodicity: null,
        paymentMonth: null,
        sortOrder: 4,
      });

      const unknown = await http
        .patch(`/api/v2/categories/${id}`)
        .set('Authorization', auth)
        .send({ periodicity: 'mensual' })
        .expect(400);
      expect(unknown.body.errors).toEqual([
        { field: 'periodicity', message: 'La periodicidad no es válida.' },
      ]);

      await http
        .post('/api/v2/categories/reorder')
        .set('Authorization', auth)
        .send({ items: [{ id: Number(id), sortOrder: 7 }] })
        .expect(204);
      expect((await v2(`/categories/${id}`).expect(200)).body.data.sortOrder).toBe(7);
    });

    it('merge, usage and delete with reassignTo move the transactions where they were told', async () => {
      await seedTransactions();
      const other = await http
        .post('/api/v2/categories')
        .set('Authorization', auth)
        .send({ name: 'Internet móvil', kind: 'expense', parentId: Number(groupId) })
        .expect(201);
      const otherId = Number(other.body.data.id);

      const merged = await http
        .post(`/api/v2/categories/${String(conceptId)}/merge`)
        .set('Authorization', auth)
        .send({ targetId: otherId })
        .expect(201);
      expect(merged.body.data.moved).toBe(1);
      expect(merged.body.data.target).toMatchObject({ id: otherId, parentId: Number(groupId) });

      const usage = await v2(`/categories/${String(groupId)}/usage`).expect(200);
      expect(usage.body.data.subcategories).toBe(1);

      // With transactions in the subtree and no destination, the delete is refused.
      await http
        .delete(`/api/v2/categories/${String(groupId)}`)
        .set('Authorization', auth)
        .expect(409);
      const fresh = await http
        .post('/api/v2/categories')
        .set('Authorization', auth)
        .send({ name: 'Otros', kind: 'expense' })
        .expect(201);
      await http
        .delete(`/api/v2/categories/${String(groupId)}?reassignTo=${String(fresh.body.data.id)}`)
        .set('Authorization', auth)
        .expect(204);
      expect(
        await env.prisma.transaction.count({
          where: { userId: user.id, categoryId: BigInt(fresh.body.data.id) },
        }),
      ).toBe(1);
    });

    it('accounts, tags, preferences, transfers and the seed take v2 bodies', async () => {
      const account = await http
        .post('/api/v2/accounts')
        .set('Authorization', auth)
        .send({
          name: 'Tarjeta',
          type: 'credit',
          creditLimit: '1000000',
          cutoffDay: 20,
          paymentDay: 5,
        })
        .expect(201);
      expect(account.body.data).toMatchObject({ creditLimit: '1000000.00', cutoffDay: 20 });
      const archived = await http
        .patch(`/api/v2/accounts/${String(account.body.data.id)}`)
        .set('Authorization', auth)
        .send({ isArchived: true })
        .expect(200);
      expect(archived.body.data.isArchived).toBe(true);
      expect((await v2('/accounts').expect(200)).body.meta.total).toBe(1);
      expect((await v2('/accounts?includeArchived=true').expect(200)).body.meta.total).toBe(2);

      const transfer = await http
        .post('/api/v2/transactions/transfer')
        .set('Authorization', auth)
        .send({
          fromAccountId: Number(accountId),
          toAccountId: Number(account.body.data.id),
          date: '2026-09-01',
          amount: '5000',
        })
        .expect(201);
      expect(transfer.body.data.legs).toHaveLength(2);
      expect(transfer.body.data.legs[0].transferGroupId).toBe(transfer.body.data.transferGroupId);

      const tag = await http
        .post('/api/v2/tags')
        .set('Authorization', auth)
        .send({ name: 'viaje', color: '#112233' });
      expect([200, 201]).toContain(tag.status);
      // The same name again is the same tag; a color that comes with it is kept.
      const again = await http
        .post('/api/v2/tags')
        .set('Authorization', auth)
        .send({ name: 'Viaje', color: '#445566' });
      expect(again.body.data).toMatchObject({ id: tag.body.data.id, color: '#445566' });
      await http
        .patch(`/api/v2/tags/${String(tag.body.data.id)}`)
        .set('Authorization', auth)
        .send({ name: 'viajes' })
        .expect(200);
      await http
        .delete(`/api/v2/tags/${String(tag.body.data.id)}`)
        .set('Authorization', auth)
        .expect(204);

      const preferences = await http
        .patch('/api/v2/preferences')
        .set('Authorization', auth)
        .send({ accountsEnabled: false })
        .expect(200);
      expect(preferences.body.data).toEqual({ accountsEnabled: false });

      const stranger = await env.crearUsuario();
      const seeded = await http
        .post('/api/v2/categories/seed')
        .set('Authorization', env.como(stranger))
        .expect(201);
      expect(seeded.body.data.created).toBeGreaterThan(0);
    });

    it('receipts travel in the "files" field, and come back as the file', async () => {
      const id = await seedTransactions();
      const uploaded = await http
        .post(`/api/v2/transactions/${id}/receipts`)
        .set('Authorization', auth)
        .attach('files', PNG, { filename: 'factura.png', contentType: 'image/png' })
        .expect(201);
      expect(uploaded.body.meta).toEqual({ page: 1, perPage: 50, total: 1 });
      const receipt = uploaded.body.data[0];
      // The store re-encodes and renames the file; what matters is the shape.
      expect(receipt).toEqual({
        id: expect.any(Number),
        position: expect.any(Number),
        fileName: expect.any(String),
        mimeType: expect.any(String),
        sizeBytes: expect.any(Number),
        isAvailable: true,
      });

      const file = await v2(`/transactions/${id}/receipts/${String(receipt.id)}`).expect(200);
      expect(file.headers['content-type']).toBe(receipt.mimeType);
      await http
        .delete(`/api/v2/transactions/${id}/receipts/${String(receipt.id)}`)
        .set('Authorization', auth)
        .expect(204);

      // Only the "files" field carries them.
      await http
        .post(`/api/v2/transactions/${id}/receipts`)
        .set('Authorization', auth)
        .attach('archivos', PNG, { filename: 'factura.png', contentType: 'image/png' })
        .expect(400);
    });

    it('a snake_case field is refused, naming the field', async () => {
      const response = await http
        .post('/api/v2/transactions')
        .set('Authorization', auth)
        .send({ date: '2026-09-01', amount: '1', category_id: Number(conceptId) })
        .expect(400);
      expect(response.body).toEqual({
        type: 'https://dev-cocoapp.viteri.me/problems/invalid_fields',
        title: 'Hay campos inválidos',
        status: 400,
        detail: 'Hay campos inválidos en la solicitud.',
        code: 'invalid_fields',
        errors: [{ field: 'category_id', message: 'property category_id should not exist' }],
      });
    });
  });

  describe('the phone capture through v2', () => {
    const SMS =
      'Bancolombia le informa compra por $45.000 en KOBA COLOMBIA el 03/10/2026 con tu tarjeta *1234';

    it('is idempotent by externalRef', async () => {
      const capture = (body: Record<string, unknown>) =>
        http.post('/api/v2/transactions/capture').set('Authorization', auth).send(body);

      const first = await capture({ text: SMS, source: 'sms', externalRef: 'sms-v2-1' }).expect(
        200,
      );
      expect(first.body.data).toMatchObject({ isDuplicate: false, isMerged: false });
      expect(first.body.data.transaction).toMatchObject({
        amount: '45000.00',
        externalRef: 'sms-v2-1',
        source: 'sms',
      });
      expect(['high', 'medium', 'none']).toContain(first.body.data.classification.certainty);
      expect(typeof first.body.data.summary).toBe('string');

      const second = await capture({ text: SMS, source: 'sms', externalRef: 'sms-v2-1' }).expect(
        200,
      );
      expect(second.body.data.isDuplicate).toBe(true);
      expect(second.body.data.transaction.id).toBe(first.body.data.transaction.id);

      expect(await env.prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
    });

    it('stores the concept the phone chose, with its note', async () => {
      const response = await http
        .post('/api/v2/transactions/capture')
        .set('Authorization', auth)
        .send({
          source: 'ios_manual',
          externalRef: 'ios-1',
          amount: '9000',
          date: '2026-10-01',
          categoryId: String(conceptId),
          note: 'pagado en efectivo',
          capturedAt: '2026-10-01T08:00:00-05:00',
        })
        .expect(200);
      expect(response.body.data.transaction).toMatchObject({
        categoryId: Number(conceptId),
        source: 'ios_manual',
      });
      expect(response.body.data.transaction.notes).toContain('pagado en efectivo');
    });

    it('interprets without writing', async () => {
      const response = await http
        .post('/api/v2/transactions/interpret')
        .set('Authorization', auth)
        .send({ text: SMS })
        .expect(200);
      expect(response.body.data).toMatchObject({ amount: '45000', date: '2026-10-03' });
      expect(['high', 'medium', 'none']).toContain(response.body.data.classification.certainty);
      expect(await env.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    });
  });

  describe('sessions', () => {
    it('a native client gets its refresh token in the body and renews with it', async () => {
      const login = await http
        .post('/api/v2/auth/login')
        .set('X-Coco-Client', 'native')
        .send({ email: user.email, password: PASSWORD_VALIDA })
        .expect(200);
      expect(login.headers['set-cookie']).toBeUndefined();
      expect(login.body.data).toMatchObject({
        accessToken: expect.any(String),
        expiresIn: expect.any(Number),
        refreshToken: expect.any(String),
        user: { email: user.email, displayName: 'Vera' },
      });

      const renewed = await http
        .post('/api/v2/auth/refresh')
        .set('X-Coco-Client', 'native')
        .send({ refreshToken: login.body.data.refreshToken })
        .expect(200);
      expect(renewed.body.data.refreshToken).not.toBe(login.body.data.refreshToken);

      await http
        .post('/api/v2/auth/logout')
        .set('X-Coco-Client', 'native')
        .send({ refreshToken: renewed.body.data.refreshToken })
        .expect(204);
      await http
        .post('/api/v2/auth/refresh')
        .set('X-Coco-Client', 'native')
        .send({ refreshToken: renewed.body.data.refreshToken })
        .expect(401);
    });

    it('the web gets an httpOnly cookie scoped to the v2 auth routes', async () => {
      const login = await http
        .post('/api/v2/auth/login')
        .send({ email: user.email, password: PASSWORD_VALIDA })
        .expect(200);
      expect(login.body.data.refreshToken).toBeUndefined();
      const cookie = (login.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) =>
        c.startsWith('coco_refresh='),
      );
      expect(cookie).toContain('Path=/api/v2/auth');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');

      await http.post('/api/v2/auth/refresh').set('Cookie', cookie!.split(';')[0]!).expect(200);
    });

    it('registers and changes the password', async () => {
      const registered = await http
        .post('/api/v2/auth/register')
        .send({ email: 'nueva-v2@pruebas.coco', password: PASSWORD_VALIDA, displayName: 'Nueva' })
        .expect(201);
      expect(registered.body.data).toEqual({
        pendingApproval: expect.any(Boolean),
        message: expect.any(String),
      });

      await http
        .post('/api/v2/auth/change-password')
        .set('Authorization', auth)
        .send({ currentPassword: 'no-es-la-buena-123!', newPassword: 'Zt4&Nube-Lejana!' })
        .expect((r) => expect([400, 401, 422]).toContain(r.status));
    });
  });

  describe('administration', () => {
    it('lists users and the audit log as pages, and acts on a user', async () => {
      const admin = await env.crearUsuario({ role: 'admin' });
      const asAdmin = env.como(admin);
      const waiting = await env.crearUsuario({ status: 'pending' });

      const users = await http
        .get('/api/v2/admin/users?status=pending&perPage=10')
        .set('Authorization', asAdmin)
        .expect(200);
      expect(users.body.meta).toEqual({ page: 1, perPage: 10, total: 1 });
      expect(users.body.data[0]).toMatchObject({ email: waiting.email, status: 'pending' });

      const approved = await http
        .post(`/api/v2/admin/users/${String(waiting.id)}/approve`)
        .set('Authorization', asAdmin)
        .expect(201);
      expect(approved.body.data).toMatchObject({ status: 'active', createdAt: expect.any(String) });
      const twice = await http
        .post(`/api/v2/admin/users/${String(waiting.id)}/approve`)
        .set('Authorization', asAdmin)
        .expect(400);
      expect(twice.body.code).toBe('user_already_active');

      await http
        .post(`/api/v2/admin/users/${String(waiting.id)}/suspend`)
        .set('Authorization', asAdmin)
        .expect(201);
      const reactivated = await http
        .post(`/api/v2/admin/users/${String(waiting.id)}/reactivate`)
        .set('Authorization', asAdmin)
        .expect(201);
      expect(reactivated.body.data.status).toBe('active');

      const log = await http
        .get('/api/v2/admin/audit-log?perPage=5')
        .set('Authorization', asAdmin)
        .expect(200);
      expect(log.body.meta).toMatchObject({ page: 1, perPage: 5 });
      expect(log.body.data[0]).toHaveProperty('entityId');
      expect(log.body.data[0]).toHaveProperty('createdAt');
    });
  });
});
