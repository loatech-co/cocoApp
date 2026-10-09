import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { makeAccount, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Money integrity (R-3): what an edit, or two captures at once, cannot leave
 * half done. Every case runs through v2.
 *
 * - Changing the amount without resending the splits: 422, and nothing changes.
 * - Editing one leg of a transfer edits both, or neither.
 * - Wallet and the SMS of the same payment, at once: a single transaction.
 */
const VERSIONS = [
  {
    v: 'v2',
    transfer: 'transferGroupId',
    merged: 'isMerged',
    capture: (ref: string, extra: Record<string, unknown>) => ({ externalRef: ref, ...extra }),
    wallet: (amount: string, at: string) => ({
      merchant: 'Exito Poblado',
      amount,
      date: '2026-10-02',
      source: 'wallet',
      capturedAt: at,
    }),
    sms: (text: string, at: string) => ({ text, source: 'sms', capturedAt: at }),
  },
] as const;

describe.each(VERSIONS)('Money integrity through $v (e2e)', (version) => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;
  let user: TestUser;
  let auth: string;
  const base = `/api/${version.v}/transactions`;

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

  const patch = (id: bigint, body: Record<string, unknown>) =>
    http.patch(`${base}/${id.toString()}`).set('Authorization', auth).send(body);

  describe('a transaction with splits', () => {
    const withSplits = async () => {
      const tx = await makeTransaction(env.prisma, user.id, { amount: '1000' });
      await env.prisma.transactionSplit.createMany({
        data: [
          { transactionId: tx.id, amount: '600' },
          { transactionId: tx.id, amount: '400' },
        ],
      });
      return tx;
    };

    it('changing the amount WITHOUT resending the splits is 422, and nothing is written', async () => {
      const tx = await withSplits();

      const response = await patch(tx.id, { amount: '1200', description: 'otra' }).expect(422);
      expect(JSON.stringify(response.body)).toMatch(/no coincide con la suma del desglose/);

      const after = await env.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
      expect(after.amount.toFixed(2)).toBe('1000.00');
      expect(after.description).toBeNull();
    });

    it('with the splits adjusted, or without touching the amount, it saves', async () => {
      const tx = await withSplits();

      await patch(tx.id, { amount: '1200', splits: [{ amount: '700' }, { amount: '500' }] }).expect(
        200,
      );
      await patch(tx.id, { amount: '1200', description: 'mismo monto' }).expect(200);
      await patch(tx.id, { description: 'sin monto' }).expect(200);

      const splits = await env.prisma.transactionSplit.findMany({
        where: { transactionId: tx.id },
      });
      expect(splits.map((s) => s.amount.toFixed(2)).sort()).toEqual(['500.00', '700.00']);
    });
  });

  describe('a transfer', () => {
    const transfer = async () => {
      const from = await makeAccount(env.prisma, user.id);
      const to = await makeAccount(env.prisma, user.id, { name: 'Ahorro', type: 'savings' });
      const group = randomUUID();
      const leg = (accountId: bigint, transferDir: 'out' | 'in') =>
        makeTransaction(env.prisma, user.id, {
          amount: '1000',
          type: 'transfer',
          transferGroupId: group,
          accountId,
          transferDir,
        });
      return { out: await leg(from.id, 'out'), in: await leg(to.id, 'in'), group, from };
    };

    const legsOf = (group: string) =>
      env.prisma.transaction.findMany({
        where: { transferGroupId: group },
        orderBy: { transferDir: 'asc' },
      });

    it('editing the amount and date of one leg edits both', async () => {
      const t = await transfer();

      await patch(t.out.id, { amount: '2500', date: '2026-09-12', description: 'Ahorro' }).expect(
        200,
      );

      const legs = await legsOf(t.group);
      expect(legs).toHaveLength(2);
      for (const leg of legs) {
        expect(leg.amount.toFixed(2)).toBe('2500.00');
        expect(leg.date.toISOString().slice(0, 10)).toBe('2026-09-12');
        expect(leg.description).toBe('Ahorro');
      }
      // The account belongs to each leg: it does not travel to the other.
      expect(legs.map((l) => l.accountId)).toContain(t.from.id);
    });

    it("a leg does not change type, nor take the other one's account: 422", async () => {
      const t = await transfer();

      await patch(t.in.id, { type: 'expense' }).expect(422);
      await patch(t.in.id, {
        accountId: Number(t.from.id),
      }).expect(422);
    });

    it('if writing the second leg fails, the first is not left written either', async () => {
      const t = await transfer();
      // A test trigger that makes ONLY the write of the `in` leg fail. The PATCH
      // comes in through the `out` one, so that one is already written when the
      // second blows up: what is checked is that it is rolled back.
      await env.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION r3_falla_la_pata_in() RETURNS trigger AS $$
        BEGIN
          IF NEW.transfer_direction::text = 'in' AND NEW.description = 'falla' THEN
            RAISE EXCEPTION 'r3: segunda pata';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await env.prisma.$executeRawUnsafe(
        `CREATE TRIGGER r3_falla_la_pata_in BEFORE UPDATE ON transactions
         FOR EACH ROW EXECUTE FUNCTION r3_falla_la_pata_in()`,
      );
      try {
        const response = await patch(t.out.id, { amount: '9000', description: 'falla' });
        expect(response.status).toBeGreaterThanOrEqual(500);
      } finally {
        await env.prisma.$executeRawUnsafe('DROP TRIGGER r3_falla_la_pata_in ON transactions');
        await env.prisma.$executeRawUnsafe('DROP FUNCTION r3_falla_la_pata_in()');
      }

      for (const leg of await legsOf(t.group)) {
        expect(leg.amount.toFixed(2)).toBe('1000.00');
        expect(leg.description).toBeNull();
      }
    });
  });

  describe('Wallet and the SMS of the same payment, at once', () => {
    const capture = (body: Record<string, unknown>) =>
      http.post(`${base}/capture`).set('Authorization', auth).send(body);

    it('end up as ONE enriched transaction, every time', async () => {
      const t0 = new Date('2026-10-02T15:00:00-05:00').getTime();

      for (let i = 0; i < 8; i++) {
        // A different amount per round: each round is a separate payment.
        const thousands = 120 + i;
        const en = new Date(t0 + i * 3_600_000).toISOString();
        const [wallet, sms] = await Promise.all([
          capture(version.capture(`w-${i}`, version.wallet(`${thousands}000`, en))),
          capture(
            version.capture(
              `s-${i}`,
              version.sms(
                `Bancolombia: compra por $${thousands}.000 en EXITO POBLADO el 02/10/2026`,
                en,
              ),
            ),
          ),
        ]);
        expect([wallet.status, sms.status]).toEqual([200, 200]);
        // Exactly one of the two was merged into the other.
        const mergedOnes = [wallet, sms].filter((r) => r.body.data[version.merged] === true);
        expect(mergedOnes).toHaveLength(1);

        const rows = await env.prisma.transaction.findMany({
          where: { userId: user.id, amount: `${thousands}000` },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.merchant).toMatch(/exito poblado/i);
        expect(rows[0]?.rawText).toContain('EXITO POBLADO');
      }
    });
  });
});
