import request from 'supertest';

import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Phase 2 — what the transaction sheet teaches the server on save.
 *
 * `POST /categorization/learn` is the path through which the system improves
 * with use: the sheet calls it when there was a suggestion and the
 * transaction was saved classified, and whatever stayed —accepted or
 * corrected— becomes a rule.
 *
 * What is protected here is what cannot fail silently: that accepting creates
 * the rule, that correcting UPDATES it instead of leaving two rules that
 * contradict each other, that a description that says nothing leaves no
 * garbage, and that nobody can point a rule at another account's category.
 */
describe('Phase 2 — Learning on save (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  let ana: TestUser;
  let beto: TestUser;
  let asAna: string;
  let asBeto: string;

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
    ana = await env.createUser({ displayName: 'Ana' });
    beto = await env.createUser({ displayName: 'Beto' });
    asAna = env.as(ana);
    asBeto = env.as(beto);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const createCategory = async (auth: string, name: string) => {
    const response = await http
      .post('/api/v2/categories')
      .set('Authorization', auth)
      .send({ name, kind: 'expense' })
      .expect(201);
    return response.body.data as { id: number };
  };

  const learn = (auth: string, description: string, categoryId: number) =>
    http
      .post('/api/v2/categorization/learn')
      .set('Authorization', auth)
      .send({ description, categoryId });

  /** A user's rules, read from the database: what was really stored. */
  const rulesOf = (user: TestUser) =>
    env.prisma.categoryRule.findMany({
      where: { userId: user.id },
      select: { pattern: true, categoryId: true, priority: true, hits: true },
    });

  // ── Accept and correct ─────────────────────────────────────────────────────

  it('accepting a suggestion creates the rule with the token that describes it', async () => {
    const energy = await createCategory(asAna, 'Energía');

    const r = await learn(asAna, 'Pago Celsia Energía', energy.id).expect(201);
    expect(r.body.data).toEqual({ learned: true });

    // «pago» is generic and dropped; of «celsia» and «energia» the longer one
    // wins. Without accents: the rule has to match what the person types next
    // time, and nobody types the same way twice.
    expect(await rulesOf(ana)).toEqual([
      { pattern: 'energia', categoryId: BigInt(energy.id), priority: 10, hits: 1 },
    ]);
  });

  it('correcting a suggestion UPDATES the rule instead of leaving two that contradict each other', async () => {
    const energy = await createCategory(asAna, 'Energía');
    const gas = await createCategory(asAna, 'Gas');

    await learn(asAna, 'Pago Celsia Energía', energy.id).expect(201);
    // The same description, another category: the person corrected it.
    await learn(asAna, 'Pago Celsia Energía', gas.id).expect(201);

    // A single rule, pointing at the last thing said, with both hits counted:
    // that is the `(userId, pattern)` key doing its job.
    expect(await rulesOf(ana)).toEqual([
      { pattern: 'energia', categoryId: BigInt(gas.id), priority: 10, hits: 2 },
    ]);
  });

  it('what was learned is what the suggestion returns next time', async () => {
    const energy = await createCategory(asAna, 'Energía');
    await learn(asAna, 'Pago Celsia Energía', energy.id).expect(201);

    const r = await http
      .get('/api/v2/categorization/suggest?description=Energ%C3%ADa%20octubre')
      .set('Authorization', asAna)
      .expect(200);

    expect(r.body.data).toMatchObject({ categoryId: energy.id, reason: 'rule' });
  });

  // ── What leaves no rule ────────────────────────────────────────────────────

  it('an empty description creates no rules, and says so', async () => {
    const energy = await createCategory(asAna, 'Energía');

    const r = await learn(asAna, '', energy.id).expect(201);
    expect(r.body.data).toEqual({ learned: false });
    expect(await rulesOf(ana)).toEqual([]);
  });

  it('nor does a description made only of generic words', async () => {
    const energy = await createCategory(asAna, 'Energía');

    // All generic, too short or a number: there is nothing to remember.
    // A «pago» rule would classify half the transactions as energy.
    const r = await learn(asAna, 'PAGO FACTURA SERVICIOS 2026', energy.id).expect(201);
    expect(r.body.data).toEqual({ learned: false });
    expect(await rulesOf(ana)).toEqual([]);
  });

  // ── Aislamiento ────────────────────────────────────────────────────────────

  it("rejects another account's category and leaves no trace", async () => {
    const betos = await createCategory(asBeto, 'Energía');

    await learn(asAna, 'Pago Celsia Energía', betos.id).expect(422);

    expect(await rulesOf(ana)).toEqual([]);
    expect(await rulesOf(beto)).toEqual([]);
  });

  it('requires the whole body: without a category or a description it is 400', async () => {
    await http
      .post('/api/v2/categorization/learn')
      .set('Authorization', asAna)
      .send({ description: 'Celsia' })
      .expect(400);
    await http
      .post('/api/v2/categorization/learn')
      .set('Authorization', asAna)
      .send({ categoryId: 1 })
      .expect(400);
  });
});
