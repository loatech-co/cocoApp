import request from 'supertest';

import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

/**
 * Phase 6.4: every movement carries its currency, COP by default, and the API
 * returns it so the client formats with the row's currency instead of a
 * hard-coded one.
 */
describe('Transaction currency (e2e)', () => {
  let env: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let ana: UsuarioDePrueba;
  let asAna: string;

  beforeAll(async () => {
    env = await levantarApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.cerrar();
  });

  beforeEach(async () => {
    await env.limpiar();
    ana = await env.crearUsuario({ displayName: 'Ana' });
    asAna = env.como(ana);
  });

  it('a new movement is COP and says so', async () => {
    const created = await http
      .post('/api/v1/transactions')
      .set('Authorization', asAna)
      .send({ date: '2026-10-01', amount: '45900', type: 'expense' })
      .expect(201);

    expect(created.body.data.currency).toBe('COP');

    const row = await env.prisma.transaction.findFirstOrThrow({ where: { userId: ana.id } });
    expect(row.currency).toBe('COP');
  });

  it('the list returns the currency of each row', async () => {
    await env.prisma.transaction.create({
      data: { userId: ana.id, date: new Date('2026-10-02'), period: new Date('2026-10-01'), amount: '10', currency: 'USD' },
    });

    const list = await http.get('/api/v1/transactions').set('Authorization', asAna).expect(200);

    expect(list.body.data.map((t: { currency: string }) => t.currency)).toEqual(['USD']);
  });
});
