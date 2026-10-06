import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { makeAccount, makeTransaction } from './factories';
import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

/**
 * Integridad del dinero (R-3): lo que una edición o dos capturas a la vez no
 * pueden dejar a medias. Cada caso corre por la v1 y por la v2.
 *
 * - Cambiar el monto sin reenviar el desglose: 422, y nada cambia.
 * - Editar una pata de una transferencia edita las dos, o ninguna.
 * - Wallet y el SMS del mismo pago, a la vez: un solo movimiento.
 */
const VERSIONES = [
  {
    v: 'v1',
    transfer: 'transfer_group_id',
    merged: 'fusionado',
    capture: (ref: string, extra: Record<string, unknown>) => ({ external_ref: ref, ...extra }),
    wallet: (monto: string, en: string) => ({
      comercio: 'Exito Poblado',
      monto,
      fecha: '2026-10-02',
      source: 'wallet',
      captured_at: en,
    }),
    sms: (texto: string, en: string) => ({ texto, source: 'sms', captured_at: en }),
  },
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

describe.each(VERSIONES)('Integridad del dinero por la $v (e2e)', (version) => {
  let env: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let user: UsuarioDePrueba;
  let auth: string;
  const base = `/api/${version.v}/transactions`;

  beforeAll(async () => {
    env = await levantarApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.cerrar();
  });

  beforeEach(async () => {
    await env.limpiar();
    user = await env.crearUsuario();
    auth = env.como(user);
  });

  const patch = (id: bigint, body: Record<string, unknown>) =>
    http.patch(`${base}/${id.toString()}`).set('Authorization', auth).send(body);

  describe('un movimiento con desglose', () => {
    const conDesglose = async () => {
      const tx = await makeTransaction(env.prisma, user.id, { amount: '1000' });
      await env.prisma.transactionSplit.createMany({
        data: [
          { transactionId: tx.id, amount: '600' },
          { transactionId: tx.id, amount: '400' },
        ],
      });
      return tx;
    };

    it('cambiar el monto SIN reenviar el desglose es 422, y no se escribe nada', async () => {
      const tx = await conDesglose();

      const response = await patch(tx.id, { amount: '1200', description: 'otra' }).expect(422);
      expect(JSON.stringify(response.body)).toMatch(/no coincide con la suma del desglose/);

      const after = await env.prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
      expect(after.amount.toFixed(2)).toBe('1000.00');
      expect(after.description).toBeNull();
    });

    it('con el desglose ajustado, o sin tocar el monto, se guarda', async () => {
      const tx = await conDesglose();

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

  describe('una transferencia', () => {
    const transferencia = async () => {
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

    const patas = (group: string) =>
      env.prisma.transaction.findMany({
        where: { transferGroupId: group },
        orderBy: { transferDir: 'asc' },
      });

    it('editar el monto y la fecha de una pata edita las dos', async () => {
      const t = await transferencia();

      await patch(t.out.id, { amount: '2500', date: '2026-09-12', description: 'Ahorro' }).expect(
        200,
      );

      const legs = await patas(t.group);
      expect(legs).toHaveLength(2);
      for (const leg of legs) {
        expect(leg.amount.toFixed(2)).toBe('2500.00');
        expect(leg.date.toISOString().slice(0, 10)).toBe('2026-09-12');
        expect(leg.description).toBe('Ahorro');
      }
      // La cuenta es de cada pata: no viaja a la otra.
      expect(legs.map((l) => l.accountId)).toContain(t.from.id);
    });

    it('una pata no cambia de tipo, ni se lleva la cuenta de la otra: 422', async () => {
      const t = await transferencia();

      await patch(t.in.id, { type: 'expense' }).expect(422);
      await patch(t.in.id, {
        [version.v === 'v1' ? 'account_id' : 'accountId']: Number(t.from.id),
      }).expect(422);
    });

    it('si la escritura de la segunda pata falla, la primera tampoco queda escrita', async () => {
      const t = await transferencia();
      // Un disparador de prueba que hace fallar SOLO la escritura de la pata
      // `in`. El PATCH entra por la `out`, así que esa ya se escribió cuando
      // revienta la segunda: lo que se comprueba es que se deshace.
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

      for (const leg of await patas(t.group)) {
        expect(leg.amount.toFixed(2)).toBe('1000.00');
        expect(leg.description).toBeNull();
      }
    });
  });

  describe('Wallet y el SMS del mismo pago, a la vez', () => {
    const capturar = (body: Record<string, unknown>) =>
      http.post(`${base}/capture`).set('Authorization', auth).send(body);

    it('acaban en UN movimiento enriquecido, todas las veces', async () => {
      const t0 = new Date('2026-10-02T15:00:00-05:00').getTime();

      for (let i = 0; i < 8; i++) {
        // Un monto distinto por vuelta: cada vuelta es un pago aparte.
        const miles = 120 + i;
        const en = new Date(t0 + i * 3_600_000).toISOString();
        const [wallet, sms] = await Promise.all([
          capturar(version.capture(`w-${i}`, version.wallet(`${miles}000`, en))),
          capturar(
            version.capture(
              `s-${i}`,
              version.sms(
                `Bancolombia: compra por $${miles}.000 en EXITO POBLADO el 02/10/2026`,
                en,
              ),
            ),
          ),
        ]);
        expect([wallet.status, sms.status]).toEqual([200, 200]);
        // Exactamente una de las dos se fusionó con la otra.
        const fusiones = [wallet, sms].filter((r) => r.body.data[version.merged] === true);
        expect(fusiones).toHaveLength(1);

        const filas = await env.prisma.transaction.findMany({
          where: { userId: user.id, amount: `${miles}000` },
        });
        expect(filas).toHaveLength(1);
        expect(filas[0]?.merchant).toMatch(/exito poblado/i);
        expect(filas[0]?.rawText).toContain('EXITO POBLADO');
      }
    });
  });
});
