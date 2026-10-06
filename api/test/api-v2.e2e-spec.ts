import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { makeAccount, makeConcept } from './factories';
import {
  levantarApp,
  PASSWORD_VALIDA,
  type EntornoDePruebas,
  type UsuarioDePrueba,
} from './helpers/app';
import { PNG } from './helpers/isolation';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { V1_DEPRECATION } from '../src/common/versioning/v1-deprecation';
import { toV2 } from '../src/contract/v2/to-v2';
import { SupabaseAuthService } from '../src/modules/auth/supabase-auth.service';

/**
 * The v2 contract (step 7.4) against v1, on the same data.
 *
 * v2 is v1 translated at the edge: same services, English and camelCase on
 * the wire, every list a page. So the strongest check is the equivalence
 * itself: each read through v2 is what `toV2` makes of the same read through
 * v1. On top of that, what translation alone cannot prove: that v2 inputs
 * reach the services with the right v1 names and words, that the capture is
 * still idempotent, that both kinds of session work, and that v1 announces
 * its deprecation and logs its use.
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
      center: { name: 'Hogar', estatico: true },
      category: { name: 'Servicios' },
      concept: {
        name: 'Internet',
        recurrente: true,
        periodicidad: 'trimestral',
        diaDePago: 5,
        mesDePago: 2,
        presupuesto: '90000',
        palabrasClave: ['fibra'],
      },
    });
    conceptId = tree.concept.id;
    groupId = tree.category.id;
    accountId = (await makeAccount(env.prisma, user.id, { name: 'Débito', type: 'debit' })).id;
    await env.prisma.userPreference.create({
      data: { userId: user.id, prefKey: 'cuentas_habilitadas', prefValue: true },
    });
  });

  const v1 = (path: string) => http.get(`/api/v1${path}`).set('Authorization', auth);
  const v2 = (path: string) => http.get(`/api/v2${path}`).set('Authorization', auth);

  /** Some transactions through v1, with everything a transaction can carry. */
  async function seedTransactions(): Promise<string> {
    const created = await http
      .post('/api/v1/transactions')
      .set('Authorization', auth)
      .send({
        date: '2026-09-03',
        amount: '45000',
        type: 'expense',
        account_id: Number(accountId),
        category_id: Number(conceptId),
        merchant: 'Fibra SAS',
        description: 'Internet de septiembre',
        tags: ['casa'],
        por_revisar: true,
        external_ref: 'v1-ref-1',
        splits: [{ category_id: Number(conceptId), amount: '45000', note: 'todo' }],
      })
      .expect(201);
    await http
      .post('/api/v1/transactions')
      .set('Authorization', auth)
      .send({ date: '2026-08-15', amount: '12000', type: 'income' })
      .expect(201);
    return String(created.body.data.id);
  }

  describe('the same data, read through both versions', () => {
    it('every read is what toV2 makes of its v1 twin', async () => {
      const transactionId = await seedTransactions();
      await http
        .post(`/api/v1/transactions/${transactionId}/soportes`)
        .set('Authorization', auth)
        .attach('archivos', PNG, { filename: 'factura.png', contentType: 'image/png' })
        .expect(201);
      await http
        .post('/api/v1/categorization/learn')
        .set('Authorization', auth)
        .send({ description: 'Fibra SAS internet', category_id: Number(conceptId) })
        .expect(201);

      const pairs: [string, string][] = [
        [`/transactions/${transactionId}`, `/transactions/${transactionId}`],
        ['/transactions/historia', '/transactions/history'],
        [`/accounts/${String(accountId)}`, `/accounts/${String(accountId)}`],
        [`/categories/${String(conceptId)}`, `/categories/${String(conceptId)}`],
        [`/categories/${String(groupId)}/usos`, `/categories/${String(groupId)}/usage`],
        ['/preferences', '/preferences'],
        ['/dashboard?from=2026-08-01&to=2026-09-30', '/dashboard?from=2026-08-01&to=2026-09-30'],
        [
          '/categorization/suggest?description=Fibra%20SAS%20internet',
          '/categorization/suggest?description=Fibra%20SAS%20internet',
        ],
        ['/auth/me', '/auth/me'],
      ];
      for (const [v1Path, v2Path] of pairs) {
        const [old, current] = await Promise.all([v1(v1Path).expect(200), v2(v2Path).expect(200)]);
        expect({ route: v2Path, body: current.body }).toEqual({
          route: v2Path,
          body: { data: toV2(old.body.data), meta: {} },
        });
      }
    });

    it('the lists are the same items, as pages', async () => {
      const transactionId = await seedTransactions();
      await http
        .post(`/api/v1/transactions/${transactionId}/soportes`)
        .set('Authorization', auth)
        .attach('archivos', PNG, { filename: 'factura.png', contentType: 'image/png' })
        .expect(201);

      const lists: [string, string][] = [
        [
          '/transactions?per_page=1&page=2&sort=-amount',
          '/transactions?perPage=1&page=2&sort=-amount',
        ],
        ['/accounts', '/accounts'],
        ['/tags', '/tags'],
        ['/categories', '/categories'],
        [`/transactions/${transactionId}/soportes`, `/transactions/${transactionId}/receipts`],
      ];
      for (const [v1Path, v2Path] of lists) {
        const [old, current] = await Promise.all([v1(v1Path).expect(200), v2(v2Path).expect(200)]);
        expect({ route: v2Path, data: current.body.data }).toEqual({
          route: v2Path,
          data: toV2(old.body.data),
        });
        // A list v1 already paged keeps its meta, translated (the transactions
        // carry their sums too); one v1 returned whole is now page 1 of 50.
        expect({ route: v2Path, meta: current.body.meta }).toEqual({
          route: v2Path,
          meta:
            old.body.meta.per_page === undefined
              ? { page: 1, perPage: 50, total: current.body.data.length }
              : toV2(old.body.meta),
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

  describe('v2 inputs reach the services in their v1 names and words', () => {
    it('a transaction written through v2 reads the same through v1', async () => {
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

      const old = await v1(`/transactions/${id}`).expect(200);
      expect(old.body.data).toMatchObject({
        account_id: Number(accountId),
        category_id: Number(conceptId),
        por_revisar: true,
        raw_text: 'texto del recibo',
        external_ref: 'v2-ref-1',
        tags: ['casa'],
        splits: [{ category_id: Number(conceptId), amount: '30000.00', note: 'todo' }],
      });
      expect(created.body.data).toEqual(toV2(old.body.data));

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

    it('a category written through v2 keeps its English words as the v1 ones', async () => {
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

      const old = await v1(`/categories/${id}`).expect(200);
      expect(old.body.data).toMatchObject({
        parent_id: Number(groupId),
        recurrente: true,
        periodicidad: 'anual',
        dia_de_pago: 10,
        mes_de_pago: 3,
        presupuesto: '1200000',
        pago_automatico: false,
        varios_pagos: true,
        palabras_clave: ['poliza', 'seguro'],
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

      const [usage, usos] = await Promise.all([
        v2(`/categories/${String(groupId)}/usage`).expect(200),
        v1(`/categories/${String(groupId)}/usos`).expect(200),
      ]);
      expect(usage.body.data).toEqual(toV2(usos.body.data));
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
      // The store re-encodes and renames the file (as in v1); what matters is the shape.
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

      // The v1 field name is not v2's.
      await http
        .post(`/api/v2/transactions/${id}/receipts`)
        .set('Authorization', auth)
        .attach('archivos', PNG, { filename: 'factura.png', contentType: 'image/png' })
        .expect(400);
    });

    it('a v1 field sent to v2 is refused, naming the field', async () => {
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

    it('is idempotent by externalRef, also against a capture made through v1', async () => {
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

      await http
        .post('/api/v1/transactions/capture')
        .set('Authorization', auth)
        .send({ texto: SMS, source: 'sms', external_ref: 'sms-v1-1' })
        .expect(200);
      const crossed = await capture({ text: SMS, source: 'sms', externalRef: 'sms-v1-1' }).expect(
        200,
      );
      expect(crossed.body.data.isDuplicate).toBe(true);

      expect(await env.prisma.transaction.count({ where: { userId: user.id } })).toBe(2);
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

    it('interprets the same as v1', async () => {
      const body = { text: SMS };
      const [old, current] = await Promise.all([
        http.post('/api/v1/transactions/interpret').set('Authorization', auth).send({ texto: SMS }),
        http.post('/api/v2/transactions/interpret').set('Authorization', auth).send(body),
      ]);
      expect(current.status).toBe(200);
      expect(current.body.data).toEqual(toV2(old.body.data));
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

    it('registers and changes the password with the v1 bodies, which were English already', async () => {
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

      const log = await http
        .get('/api/v2/admin/audit-log?perPage=5')
        .set('Authorization', asAdmin)
        .expect(200);
      expect(log.body.meta).toMatchObject({ page: 1, perPage: 5 });
      expect(log.body.data[0]).toHaveProperty('entityId');
      expect(log.body.data[0]).toHaveProperty('createdAt');
    });
  });

  describe('v1 is deprecated', () => {
    it('every v1 response says so and names its v2 successor; v2 does not', async () => {
      const old = await v1('/transactions/historia').expect(200);
      expect(old.headers.deprecation).toBe(V1_DEPRECATION);
      expect(old.headers.link).toBe('</api/v2/transactions/history>; rel="successor-version"');

      const failed = await http.get('/api/v1/accounts').expect(401);
      expect(failed.headers.deprecation).toBe(V1_DEPRECATION);

      const current = await v2('/transactions/history').expect(200);
      expect(current.headers.deprecation).toBeUndefined();
      expect(current.headers.link).toBeUndefined();
    });

    it('each v1 use leaves one log line with the route template and nothing personal', async () => {
      const lines: Record<string, unknown>[] = [];
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(SupabaseAuthService)
        .useValue({})
        .compile();
      const app = moduleRef.createNestApplication();
      configureApp(app, app.get(ConfigService), (entry) => lines.push(entry));
      await app.init();
      try {
        const server = app.getHttpServer();
        await request(server).get('/api/v1/health').expect(200);
        await request(server).get('/api/v1/transactions/123?q=farmacia').expect(401);
        await request(server).get('/api/v2/health').expect(200);

        const uses = lines.filter((line) => line.msg === 'v1_used');
        expect(uses).toEqual([
          { context: 'deprecation', msg: 'v1_used', method: 'GET', route: '/api/v1/health' },
          {
            context: 'deprecation',
            msg: 'v1_used',
            method: 'GET',
            route: '/api/v1/transactions/:id',
          },
        ]);
        expect(JSON.stringify(uses)).not.toContain('farmacia');
      } finally {
        await app.close();
      }
    });
  });
});
