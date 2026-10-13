import request from 'supertest';

import { makeConcept, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';
import { AutoChargeTask } from '../src/modules/dashboard/auto-charge.task';

/**
 * Pausing the renewal of a recurring concept (ADR 0036): the endpoints, the
 * rules a period must follow, the auto-charge task and the pending payments
 * skipping paused months, and deleting already written charges only on
 * confirmation and only when the task wrote them.
 */
describe('Recurrence pauses (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let task: AutoChargeTask;
  let user: TestUser;
  let auth: string;

  /** Mid-month in Bogotá, so a concept due on the 1st is already due. */
  const midMonth = (month: string) => new Date(`${month}-15T15:00:00Z`);

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
    user = await env.createUser();
    auth = env.as(user);
  });

  async function recurringConcept(isAutoPaid = true): Promise<bigint> {
    const { concept } = await makeConcept(env.prisma, user.id, {
      concept: {
        name: 'Streaming',
        isRecurring: true,
        periodicity: 'monthly',
        paymentDay: 1,
        budget: '100',
        isAutoPaid,
      },
    });
    return concept.id;
  }

  const pausesOf = (id: bigint) => `/api/v2/categories/${String(id)}/pauses`;
  const pause = (id: bigint, fromMonth: string) =>
    http.post(pausesOf(id)).set('Authorization', auth).send({ fromMonth });
  const resume = (id: bigint, pauseId: number, resumeMonth: string) =>
    http
      .patch(`${pausesOf(id)}/${pauseId}`)
      .set('Authorization', auth)
      .send({ resumeMonth });

  it('pauses, lists the history and resumes', async () => {
    const id = await recurringConcept();

    const created = await pause(id, '2026-10').expect(201);
    expect(created.body.data).toMatchObject({
      categoryId: Number(id),
      fromMonth: '2026-10',
      resumeMonth: null,
    });

    const resumed = await resume(id, created.body.data.id, '2026-12').expect(200);
    expect(resumed.body.data).toMatchObject({ fromMonth: '2026-10', resumeMonth: '2026-12' });

    await pause(id, '2027-03').expect(201);
    const list = await http.get(pausesOf(id)).set('Authorization', auth).expect(200);
    expect(list.body.data.map((p: { fromMonth: string }) => p.fromMonth)).toEqual([
      '2027-03',
      '2026-10',
    ]);
    expect(list.body.meta.total).toBe(2);
  });

  it('refuses a concept that is not recurring, a period that overlaps and a resume before the start', async () => {
    const { concept: plain } = await makeConcept(env.prisma, user.id);
    expect((await pause(plain.id, '2026-10').expect(422)).body.code).toBe(
      'pause_requires_recurring',
    );

    const id = await recurringConcept();
    const open = await pause(id, '2026-10').expect(201);
    expect((await pause(id, '2027-01').expect(409)).body.code).toBe('pause_overlaps');

    expect((await resume(id, open.body.data.id, '2026-10').expect(422)).body.code).toBe(
      'pause_resume_not_after_start',
    );

    await resume(id, open.body.data.id, '2026-12').expect(200);
    // Starting before December would share November with the closed one.
    expect((await pause(id, '2026-11').expect(409)).body.code).toBe('pause_overlaps');
    // An open pause from December would run into a later period.
    const later = await pause(id, '2027-02').expect(201);
    await resume(id, later.body.data.id, '2027-04').expect(200);
    await pause(id, '2026-12').expect(409);

    expect(await env.prisma.recurrencePause.count({ where: { categoryId: id } })).toBe(2);
  });

  it('rejects a malformed month', async () => {
    const id = await recurringConcept();
    await pause(id, '2026-13').expect(400);
    await pause(id, '2026-10-01').expect(400);
  });

  it('deletes a period, and a second delete is a 404', async () => {
    const id = await recurringConcept();
    const created = await pause(id, '2027-01').expect(201);
    const path = `${pausesOf(id)}/${created.body.data.id}`;

    await http.delete(path).set('Authorization', auth).expect(204);
    await http.delete(path).set('Authorization', auth).expect(404);
    expect(await env.prisma.recurrencePause.count()).toBe(0);
  });

  it('the auto-charge task skips the paused months: paused in October, active again from December', async () => {
    const id = await recurringConcept();
    const created = await pause(id, '2026-10').expect(201);
    await resume(id, created.body.data.id, '2026-12').expect(200);

    const charged: Record<string, number> = {};
    for (const month of ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']) {
      charged[month] = await task.runOnce(midMonth(month));
    }

    expect(charged).toEqual({
      '2026-09': 1,
      '2026-10': 0,
      '2026-11': 0,
      '2026-12': 1,
      '2027-01': 1,
    });
  });

  it('lists only the auto-generated charges inside the pause, and deletes only the confirmed ones', async () => {
    const id = await recurringConcept();
    await task.runOnce(midMonth('2026-09'));
    await task.runOnce(midMonth('2026-10'));
    const manual = await makeTransaction(env.prisma, user.id, {
      categoryId: id,
      date: '2026-10-20',
    });

    const created = await pause(id, '2026-10').expect(201);
    const chargesPath = `${pausesOf(id)}/${created.body.data.id}/charges`;
    const listed = await http.get(chargesPath).set('Authorization', auth).expect(200);

    expect(listed.body.data).toEqual([
      expect.objectContaining({ month: '2026-10', date: '2026-10-01', conceptName: 'Streaming' }),
    ]);
    const [charge] = listed.body.data as { id: number }[];

    // A movement recorded by hand is never a candidate, and nothing is deleted.
    const refused = await http
      .post(`${chargesPath}/discard`)
      .set('Authorization', auth)
      .send({ transactionIds: [charge?.id, Number(manual.id)] })
      .expect(422);
    expect(refused.body.code).toBe('charge_not_in_pause');
    expect(await env.prisma.transaction.count({ where: { categoryId: id } })).toBe(3);

    const discarded = await http
      .post(`${chargesPath}/discard`)
      .set('Authorization', auth)
      .send({ transactionIds: [charge?.id] })
      .expect(200);
    expect(discarded.body.data).toEqual({ deleted: 1 });

    const left = await env.prisma.transaction.findMany({
      where: { categoryId: id },
      orderBy: { date: 'asc' },
    });
    expect(left.map((t) => [t.externalRef, t.date.toISOString().slice(0, 10)])).toEqual([
      [`auto:${String(id)}:2026-09`, '2026-09-01'],
      [null, '2026-10-20'],
    ]);
  });

  it('a paused concept leaves the pending payments and the month’s budget', async () => {
    const id = await recurringConcept(false);
    const today = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 7);

    const before = await http.get('/api/v2/dashboard').set('Authorization', auth).expect(200);
    expect(before.body.data.pending.map((p: { name: string }) => p.name)).toEqual(['Streaming']);
    expect(before.body.data.requiredBudget).toBe('100.00');

    await pause(id, today).expect(201);

    const after = await http.get('/api/v2/dashboard').set('Authorization', auth).expect(200);
    expect(after.body.data.pending).toEqual([]);
    expect(after.body.data.requiredBudget).toBe('0.00');
  });
});
