import sharp from 'sharp';
import request from 'supertest';

import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';
import { RECEIPT_STORE, type ReceiptStore } from '../src/modules/receipts/receipt-store';

/**
 * Phase 6.9: a receipt's FILE goes with its row.
 *
 * Deleting a receipt, a movement, or one leg of a transfer used to delete the
 * rows and leave the files behind. Runs against whichever store the app is
 * configured with: the disk in the normal suite, and the Supabase dev bucket
 * when started with SOPORTES_STORAGE=supabase (the end-to-end check before
 * deploying the move to Storage).
 */
describe('Receipt files follow their rows (e2e)', () => {
  let env: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  let store: ReceiptStore;
  let ana: UsuarioDePrueba;
  let asAna: string;
  let image: Buffer;

  beforeAll(async () => {
    env = await levantarApp();
    http = request(env.app.getHttpServer());
    store = env.app.get(RECEIPT_STORE);
    image = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    await env.cerrar();
  });

  beforeEach(async () => {
    await env.limpiar();
    ana = await env.crearUsuario({ displayName: 'Ana' });
    asAna = env.como(ana);
  });

  async function movementWithReceipt(): Promise<{ id: string; key: string; soporteId: string }> {
    const created = await http
      .post('/api/v2/transactions')
      .set('Authorization', asAna)
      .send({ date: '2026-10-01', amount: '1000', type: 'expense' })
      .expect(201);
    const id = String(created.body.data.id);

    await http
      .post(`/api/v2/transactions/${id}/receipts`)
      .set('Authorization', asAna)
      .attach('files', image, { filename: 'r.png', contentType: 'image/png' })
      .expect(201);

    const row = await env.prisma.receipt.findFirstOrThrow({ where: { transactionId: BigInt(id) } });
    return { id, key: row.storageKey, soporteId: String(row.id) };
  }

  it('an uploaded receipt is in the store and can be downloaded', async () => {
    const { id, key, soporteId } = await movementWithReceipt();

    expect(await store.exists(key)).toBe(true);
    const list = await http
      .get(`/api/v2/transactions/${id}/receipts`)
      .set('Authorization', asAna)
      .expect(200);
    expect(list.body.data[0].isAvailable).toBe(true);
    await http
      .get(`/api/v2/transactions/${id}/receipts/${soporteId}`)
      .set('Authorization', asAna)
      .expect(200);
  });

  it('deleting a receipt deletes its file', async () => {
    const { id, key, soporteId } = await movementWithReceipt();

    await http
      .delete(`/api/v2/transactions/${id}/receipts/${soporteId}`)
      .set('Authorization', asAna)
      .expect(204);

    expect(await store.exists(key)).toBe(false);
  });

  it('deleting a movement deletes the files of its receipts', async () => {
    const { id, key } = await movementWithReceipt();

    await http.delete(`/api/v2/transactions/${id}`).set('Authorization', asAna).expect(204);

    expect(await env.prisma.receipt.count({ where: { storageKey: key } })).toBe(0);
    expect(await store.exists(key)).toBe(false);
  });

  it('a failed delete of someone else’s movement touches no file', async () => {
    const { id, key } = await movementWithReceipt();
    const bruno = await env.crearUsuario({ displayName: 'Bruno' });

    await http
      .delete(`/api/v2/transactions/${id}`)
      .set('Authorization', env.como(bruno))
      .expect(404);

    expect(await store.exists(key)).toBe(true);
  });
});
