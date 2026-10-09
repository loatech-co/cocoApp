import request from 'supertest';

import { makeConcept, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * The cost-center tree end to end: what a PATCH may change, the shapes it may
 * never take (a cycle, a fourth level, a multi-payment concept off its level),
 * and merging two concepts with their movements.
 */
describe('Categories (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let user: TestUser;
  let auth: string;

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
    auth = env.as(user);
  });

  const base = '/api/v2/categories';
  const patch = (id: bigint, body: Record<string, unknown>) =>
    http.patch(`${base}/${id}`).set('Authorization', auth).send(body);

  it('changes every field a PATCH brings', async () => {
    const { concept } = await makeConcept(env.prisma, user.id);

    const response = await patch(concept.id, {
      name: 'Energía',
      kind: 'expense',
      color: '#123456',
      icon: 'zap',
      sortOrder: 4,
      isRecurring: true,
      periodicity: 'annual',
      paymentDay: 10,
      paymentMonth: 3,
      budget: 90000,
      isAutoPaid: true,
      keywords: ['enel'],
    }).expect(200);

    expect(response.body.data).toMatchObject({
      name: 'Energía',
      color: '#123456',
      icon: 'zap',
      sortOrder: 4,
      periodicity: 'annual',
      paymentMonth: 3,
      budget: '90000',
      isAutoPaid: true,
      keywords: ['enel'],
    });

    const archived = await patch(concept.id, { isArchived: true, isStatic: false }).expect(200);
    expect(archived.body.data.isArchived).toBe(true);
  });

  it('moves a category to the top level and refuses a cycle or a fourth level', async () => {
    const tree = await makeConcept(env.prisma, user.id);
    const other = await makeConcept(env.prisma, user.id, { center: { name: 'Oficina' } });

    await patch(tree.center.id, { parentId: Number(tree.concept.id) }).expect(422);
    const deep = await patch(other.category.id, { parentId: Number(tree.concept.id) }).expect(422);
    expect(deep.body.detail).toMatch(/hasta 3 niveles/);

    const top = await patch(tree.category.id, { parentId: null }).expect(200);
    expect(top.body.data.parentId).toBeNull();
  });

  it('keeps a multi-payment concept on the concept level, recurring and not auto-paid', async () => {
    const { concept, center } = await makeConcept(env.prisma, user.id, {
      concept: { isRecurring: true, periodicity: 'monthly', paymentDay: 1, isMultiPayment: true },
    });

    const autoPaid = await patch(concept.id, { isAutoPaid: true }).expect(422);
    expect(autoPaid.body.detail).toEqual(expect.any(String));
    await patch(concept.id, { parentId: Number(center.id) }).expect(422);
    await patch(concept.id, { isRecurring: false }).expect(422);
    await patch(concept.id, { name: 'Mercado' }).expect(200);
  });

  it('reorders siblings', async () => {
    const { center, category } = await makeConcept(env.prisma, user.id);
    const sibling = await env.prisma.category.create({
      data: { userId: user.id, name: 'Impuestos', parentId: center.id },
    });

    await http
      .post(`${base}/reorder`)
      .set('Authorization', auth)
      .send({
        items: [
          { id: Number(sibling.id), sortOrder: 0 },
          { id: Number(category.id), sortOrder: 1 },
        ],
      })
      .expect(204);

    const after = await env.prisma.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(after.sortOrder).toBe(1);
  });

  describe('merging concepts', () => {
    const merge = (from: bigint, to: bigint) =>
      http
        .post(`${base}/${from}/merge`)
        .set('Authorization', auth)
        .send({ targetId: Number(to) });

    it('moves the movements to the surviving concept and removes the other', async () => {
      const a = await makeConcept(env.prisma, user.id);
      const b = await env.prisma.category.create({
        data: { userId: user.id, name: 'Energía', parentId: a.category.id },
      });
      await makeTransaction(env.prisma, user.id, { categoryId: a.concept.id });
      await makeTransaction(env.prisma, user.id, { categoryId: a.concept.id });

      const response = await merge(a.concept.id, b.id).expect(201);

      expect(response.body.data).toMatchObject({ moved: 2, target: { name: 'Energía' } });
      expect(await env.prisma.transaction.count({ where: { categoryId: b.id } })).toBe(2);
      expect(await env.prisma.category.findUnique({ where: { id: a.concept.id } })).toBeNull();
    });

    it('refuses to merge a concept with itself, a center, or a concept with children', async () => {
      const a = await makeConcept(env.prisma, user.id);
      const b = await makeConcept(env.prisma, user.id, { center: { name: 'Oficina' } });

      await merge(a.concept.id, a.concept.id).expect(422);
      await merge(a.center.id, b.concept.id).expect(422);
      const withChildren = await merge(a.category.id, b.concept.id).expect(422);
      expect(withChildren.body.detail).toMatch(/tiene otras categorías dentro/);
    });
  });
});
