import request from 'supertest';

import { makeConcept } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';
import { AutoChargeTask } from '../src/modules/dashboard/auto-charge.task';

/**
 * Phase 6.7: auto-paid concepts are charged by an in-process task, not by
 * GET /dashboard. Running the task twice in a row creates each movement once,
 * and opening the dashboard writes nothing.
 */
describe('Auto-charge task (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let task: AutoChargeTask;
  let ana: TestUser;
  let bruno: TestUser;

  /** Mid-month in Bogotá, so a concept due on the 1st is already due. */
  const NOW = new Date('2026-10-15T15:00:00Z');

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
    task = env.app.get(AutoChargeTask);
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
    ana = await env.createUser({ displayName: 'Ana' });
    bruno = await env.createUser({ displayName: 'Bruno' });
  });

  async function autoPaidConcept(userId: bigint, name: string): Promise<bigint> {
    const { concept } = await makeConcept(env.prisma, userId, {
      center: { name: `${name} centro` },
      category: { name: `${name} grupo` },
      concept: {
        name,
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 1,
        budget: '50000',
        isAutoPaid: true,
      },
    });
    return concept.id;
  }

  it('two runs in a row charge each concept once, for every user', async () => {
    const anaConcept = await autoPaidConcept(ana.id, 'Netflix');
    const brunoConcept = await autoPaidConcept(bruno.id, 'Gimnasio');

    const first = await task.runOnce(NOW);
    const second = await task.runOnce(NOW);

    expect(first).toBe(2);
    expect(second).toBe(0);
    expect(
      await env.prisma.transaction.count({ where: { userId: ana.id, categoryId: anaConcept } }),
    ).toBe(1);
    expect(
      await env.prisma.transaction.count({ where: { userId: bruno.id, categoryId: brunoConcept } }),
    ).toBe(1);
  });

  it('two runs at the same time still charge once', async () => {
    const concept = await autoPaidConcept(ana.id, 'Netflix');

    await Promise.all([task.runOnce(NOW), task.runOnce(NOW)]);

    expect(await env.prisma.transaction.count({ where: { categoryId: concept } })).toBe(1);
  });

  it('GET /dashboard no longer writes', async () => {
    await autoPaidConcept(ana.id, 'Netflix');

    await http.get('/api/v2/dashboard').set('Authorization', env.as(ana)).expect(200);

    expect(await env.prisma.transaction.count({ where: { userId: ana.id } })).toBe(0);
  });
});
