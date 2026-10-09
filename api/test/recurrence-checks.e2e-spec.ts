import request from 'supertest';

import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Phase 6.3: the CHECK constraints on a concept's recurrence.
 *
 * Two things are verified against the real test database: that each
 * constraint exists and rejects what it should (straight SQL, bypassing the
 * API on purpose — that is the case they are there for), and that when one
 * fires behind an endpoint the client gets a 422 with the rule in words.
 */
describe('Recurrence CHECK constraints (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let ana: TestUser;
  let asAna: string;

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
    asAna = env.as(ana);
  });

  /** A recurring monthly concept that satisfies every constraint. */
  async function validConcept(): Promise<bigint> {
    const concept = await env.prisma.category.create({
      data: {
        userId: ana.id,
        name: 'Arriendo',
        kind: 'expense',
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 5,
      },
    });
    return concept.id;
  }

  it.each([
    ['ck_categories_recurring_has_periodicity', `"periodicidad" = NULL`],
    ['ck_categories_payment_month_not_monthly', `"mes_de_pago" = 3`],
    ['ck_categories_payment_day_range', `"dia_de_pago" = 32`],
    ['ck_categories_payment_month_range', `"periodicidad" = 'anual', "mes_de_pago" = 13`],
    ['ck_categories_multi_payment_not_auto', `"varios_pagos" = true, "pago_automatico" = true`],
    [
      'ck_categories_multi_payment_recurring',
      `"recurrente" = false, "periodicidad" = NULL, "varios_pagos" = true`,
    ],
  ])('%s rejects a direct write', async (constraint, assignment) => {
    const id = await validConcept();

    await expect(
      env.prisma.$executeRawUnsafe(`UPDATE "categories" SET ${assignment} WHERE "id" = $1`, id),
    ).rejects.toThrow(constraint);
  });

  it('accepts every coherent combination the app writes', async () => {
    const id = await validConcept();
    const coherent = [
      `"periodicidad" = 'trimestral', "mes_de_pago" = 3, "dia_de_pago" = 31`,
      `"periodicidad" = 'anual', "mes_de_pago" = 12, "dia_de_pago" = 1`,
      `"varios_pagos" = true, "pago_automatico" = false, "periodicidad" = 'mensual', "mes_de_pago" = NULL`,
      `"recurrente" = false, "periodicidad" = NULL, "dia_de_pago" = NULL, "varios_pagos" = false`,
    ];

    for (const assignment of coherent) {
      await env.prisma.$executeRawUnsafe(
        `UPDATE "categories" SET ${assignment} WHERE "id" = $1`,
        id,
      );
    }
  });

  it('answers 422 with the rule in words when a constraint fires behind an endpoint', async () => {
    // The DTO does not require a periodicity on a recurring concept, so this
    // request reaches the table and the constraint is what stops it.
    const response = await http
      .post('/api/v2/categories')
      .set('Authorization', asAna)
      .send({ name: 'Arriendo', kind: 'expense', isRecurring: true })
      .expect(422);

    expect(response.body).toMatchObject({
      status: 422,
      code: 'check_violation',
      detail: 'Un concepto recurrente necesita una periodicidad: cada cuánto vuelve.',
    });
    expect(await env.prisma.category.count({ where: { userId: ana.id } })).toBe(0);
  });
});
