import { rmSync } from 'node:fs';
import sharp from 'sharp';
import request from 'supertest';

import { startApp, type TestEnvironment } from './helpers/app';
import { RECEIPT_STORE, type ReceiptStore } from '../src/modules/receipts/receipt-store';
import { newStorageKey, storeFolder, hashOf } from '../src/modules/receipts/receipts.storage';

/**
 * Receipts — the proof of a transaction.
 *
 * What is protected here is not that the feature returns what it should: it
 * is that it does NOT return what it should not. A receipt carries the
 * holder's name, an account number and sometimes a usage figure that tells
 * whether the house was empty in August. Half of these tests check closed
 * doors.
 */
describe('Receipts (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  let ana: string;
  let beto: string;
  let anaId: bigint;
  let betoId: bigint;

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
    // The test store goes entirely: they are fake bytes, but piling up garbage
    // between runs ends up hiding a real failure behind a file left over from
    // last time.
    rmSync(storeFolder(), { recursive: true, force: true });
  });

  beforeEach(async () => {
    await env.clean();
    const a = await env.createUser({ displayName: 'Ana' });
    const b = await env.createUser({ displayName: 'Beto' });
    ana = env.as(a);
    beto = env.as(b);
    anaId = a.id;
    betoId = b.id;
  });

  /** A transaction with its receipts, written the way the importer writes them. */
  const withReceipts = async (
    auth: string,
    userId: bigint,
    contents: { name: string; mime: string; ext: string; bytes: Buffer }[],
  ) => {
    const transaction = await http
      .post('/api/v2/transactions')
      .set('Authorization', auth)
      .send({ date: '2026-08-12', amount: '120000', type: 'expense' })
      .expect(201);

    const transactionId = BigInt(transaction.body.data.id);
    const receipts = [];

    for (const [i, c] of contents.entries()) {
      const storageKey = newStorageKey(userId, c.ext);
      // Through the app's store, so the suite runs against disk or the Storage bucket (6.9).
      await env.app.get<ReceiptStore>(RECEIPT_STORE).save(storageKey, c.bytes, c.mime);
      receipts.push(
        await env.prisma.receipt.create({
          data: {
            userId,
            transactionId,
            position: i + 1,
            fileName: c.name,
            mimeType: c.mime,
            storageKey,
            sizeBytes: c.bytes.length,
            contentHash: hashOf(c.bytes),
          },
        }),
      );
    }

    return { transactionId, receipts };
  };

  const pdf = (text: string) => ({
    name: `${text}.pdf`,
    mime: 'application/pdf',
    ext: 'pdf',
    // A real PDF starts with %PDF-: that way the content-type is not a promise
    // nobody checks.
    bytes: Buffer.from(`%PDF-1.4\n${text}\n%%EOF\n`),
  });

  // ── Puertas cerradas ──────────────────────────────────────────────────────

  describe('Who CANNOT see a receipt', () => {
    it('without a session, 401 on list and on download', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      await http.get(`/api/v2/transactions/${transactionId}/receipts`).expect(401);
      await http
        .get(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .expect(401);
    });

    it('with a made-up token, 401', async () => {
      const { transactionId } = await withReceipts(ana, anaId, [pdf('recibo')]);

      await http
        .get(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', 'Bearer no-soy-un-token')
        .expect(401);
    });

    it("Beto does not see the receipts of a transaction of Ana's", async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      // The list does not say "forbidden": for that query those receipts do not
      // exist. Saying "forbidden" would confirm the transaction belongs to someone.
      const list = await http
        .get(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', beto)
        .expect(200);
      expect(list.body.data).toEqual([]);

      await http
        .get(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .set('Authorization', beto)
        .expect(404);
    });

    it("Beto cannot sneak Ana's receipt through a transaction of his own", async () => {
      // The obvious attack against a half-done check: the transaction id is
      // mine, the receipt's is someone else's. The three conditions go in the
      // same WHERE precisely because of this.
      const anas = await withReceipts(ana, anaId, [pdf('el-de-ana')]);
      const betos = await withReceipts(beto, betoId, [pdf('el-de-beto')]);

      await http
        .get(`/api/v2/transactions/${betos.transactionId}/receipts/${anas.receipts[0]!.id}`)
        .set('Authorization', beto)
        .expect(404);
    });

    it("Beto cannot upload a receipt to a transaction of Ana's", async () => {
      const { transactionId } = await withReceipts(ana, anaId, [pdf('recibo')]);

      const image = await sharp({
        create: { width: 400, height: 500, channels: 3, background: { r: 10, g: 10, b: 10 } },
      })
        .png()
        .toBuffer();

      // 404 and not 403: confirming the transaction exists already tells
      // something about someone else's data.
      await http
        .post(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', beto)
        .attach('files', image, { filename: 'x.png', contentType: 'image/png' })
        .expect(404);

      // And nothing was created: ownership is checked BEFORE processing.
      expect(await env.prisma.receipt.count({ where: { transactionId } })).toBe(1);
    });

    it('without a session nothing is uploaded or deleted', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      await http
        .post(`/api/v2/transactions/${transactionId}/receipts`)
        .attach('files', Buffer.from('%PDF-1.4\n%%EOF\n'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        })
        .expect(401);

      await http
        .delete(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .expect(401);
    });

    it("Beto cannot delete a receipt of Ana's", async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      await http
        .delete(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .set('Authorization', beto)
        .expect(404);

      expect(await env.prisma.receipt.count({ where: { transactionId } })).toBe(1);
    });

    it('a key that escapes the store returns nothing', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      // Nobody can write this from outside —the server generates the key— but
      // if one ever arrives crooked, the resolver is the only thing left between
      // it and the file system.
      await env.prisma.receipt.update({
        where: { id: receipts[0]!.id },
        data: { storageKey: '../../../../../../etc/passwd' },
      });

      await http
        .get(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .set('Authorization', ana)
        .expect(404);
    });
  });

  // ── What does work ────────────────────────────────────────────────────────

  describe('What the owner sees', () => {
    it('lists their receipts in order', async () => {
      const { transactionId } = await withReceipts(ana, anaId, [
        pdf('uno'),
        pdf('dos'),
        pdf('tres'),
      ]);

      const r = await http
        .get(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', ana)
        .expect(200);

      expect(r.body.data.map((s: { position: number }) => s.position)).toEqual([1, 2, 3]);
      expect(r.body.data[0].fileName).toBe('uno.pdf');
      expect(r.body.data.every((s: { isAvailable: boolean }) => s.isAvailable)).toBe(true);
      // The record does NOT carry the store path. Showing it would open no door
      // —there is no file server behind it— but it draws the map.
      expect(r.body.data[0]).not.toHaveProperty('storage_key');
    });

    it('downloads the file, with its type and its bytes', async () => {
      const first = pdf('recibo-de-agosto');
      const { transactionId, receipts } = await withReceipts(ana, anaId, [first]);

      const r = await http
        .get(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .set('Authorization', ana)
        .expect(200);

      expect(r.headers['content-type']).toContain('application/pdf');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['cache-control']).toContain('no-store');
      // The bytes, exact: the interceptor that wraps everything in `{data, meta}`
      // has to let a stream through untouched.
      expect(Buffer.from(r.body).equals(first.bytes)).toBe(true);
    });

    it('a transaction without receipts returns an empty list, not an error', async () => {
      const transaction = await http
        .post('/api/v2/transactions')
        .set('Authorization', ana)
        .send({ date: '2026-08-12', amount: '1000', type: 'expense' })
        .expect(201);

      const r = await http
        .get(`/api/v2/transactions/${Number(transaction.body.data.id)}/receipts`)
        .set('Authorization', ana)
        .expect(200);

      expect(r.body.data).toEqual([]);
    });

    it('the record is left without a file if the store does not have it', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      // A half-synced store: the row exists, the binary not yet.
      await env.prisma.receipt.update({
        where: { id: receipts[0]!.id },
        data: { storageKey: `${anaId}/no-existe.pdf` },
      });

      const r = await http
        .get(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', ana)
        .expect(200);

      // It is listed all the same, marked as not isAvailable: hiding it would
      // suggest the receipt was never uploaded, which is a different problem.
      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0].isAvailable).toBe(false);
    });

    it('uploads a receipt and leaves it grey, light and named after the transaction', async () => {
      const transaction = await http
        .post('/api/v2/transactions')
        .set('Authorization', ana)
        .send({
          date: '2026-08-12',
          amount: '120000',
          type: 'expense',
          description: 'PILA / Seguridad Social',
        })
        .expect(201);

      const id = Number(transaction.body.data.id);

      // A large COLOUR image: it is what comes from a phone camera, and it is
      // where it shows whether the processing ran or not.
      const color = await sharp({
        create: { width: 2400, height: 3000, channels: 3, background: { r: 200, g: 40, b: 40 } },
      })
        .png()
        .toBuffer();

      const r = await http
        .post(`/api/v2/transactions/${id}/receipts`)
        .set('Authorization', ana)
        .attach('files', color, { filename: 'IMG_4821.PNG', contentType: 'image/png' })
        .expect(201);

      expect(r.body.data).toHaveLength(1);
      const receipt = r.body.data[0];

      // The name comes from the TRANSACTION, not from the file, and the slash
      // that does not fit in a file name becomes a hyphen —same as in the batch—.
      expect(receipt.fileName).toBe('PILA - Seguridad Social - 2026-08-12.jpg');
      expect(receipt.mimeType).toBe('image/jpeg');
      expect(receipt.position).toBe(1);

      // And the saved file is grey and 1100 wide, not the original image.
      const saved = await env.prisma.receipt.findFirst({
        where: { transactionId: BigInt(id) },
      });
      const stream = await env.app.get<ReceiptStore>(RECEIPT_STORE).open(saved!.storageKey);
      const bytes = Buffer.concat(await stream!.toArray());
      const meta = await sharp(bytes).metadata();

      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(1100);
      expect(meta.channels).toBe(1);
      expect(bytes.length).toBeLessThan(color.length / 4);
    });

    it('the "i of N" is recomputed on add, without renaming the earlier ones', async () => {
      const transaction = await http
        .post('/api/v2/transactions')
        .set('Authorization', ana)
        .send({ date: '2026-08-12', amount: '90000', type: 'expense', description: 'Claro Movil' })
        .expect(201);

      const id = Number(transaction.body.data.id);

      const image = (shade: number) =>
        sharp({
          create: {
            width: 800,
            height: 1000,
            channels: 3,
            background: { r: shade, g: shade, b: shade },
          },
        })
          .png()
          .toBuffer();

      const second = await http
        .post(`/api/v2/transactions/${id}/receipts`)
        .set('Authorization', ana)
        .attach('files', await image(10), { filename: 'a.png', contentType: 'image/png' })
        .attach('files', await image(120), { filename: 'b.png', contentType: 'image/png' })
        .expect(201);

      expect(second.body.data.map((s: { position: number }) => s.position)).toEqual([1, 2]);

      const third = await http
        .post(`/api/v2/transactions/${id}/receipts`)
        .set('Authorization', ana)
        .attach('files', await image(230), { filename: 'c.png', contentType: 'image/png' })
        .expect(201);

      // The third continues the count, and the first two do NOT change name:
      // the total is baked into none of them, it is counted when they are read.
      expect(third.body.data.map((s: { position: number }) => s.position)).toEqual([1, 2, 3]);
      expect(new Set(third.body.data.map((s: { fileName: string }) => s.fileName))).toEqual(
        new Set(['Claro Movil - 2026-08-12.jpg']),
      );
    });

    it('uploading the same file twice does not duplicate it', async () => {
      const transaction = await http
        .post('/api/v2/transactions')
        .set('Authorization', ana)
        .send({ date: '2026-08-12', amount: '90000', type: 'expense', description: 'Agua' })
        .expect(201);

      const id = Number(transaction.body.data.id);
      const image = await sharp({
        create: { width: 600, height: 800, channels: 3, background: { r: 90, g: 90, b: 90 } },
      })
        .png()
        .toBuffer();

      await http
        .post(`/api/v2/transactions/${id}/receipts`)
        .set('Authorization', ana)
        .attach('files', image, { filename: 'recibo.png', contentType: 'image/png' })
        .expect(201);

      const second = await http
        .post(`/api/v2/transactions/${id}/receipts`)
        .set('Authorization', ana)
        .attach('files', image, { filename: 'otro-nombre.png', contentType: 'image/png' })
        .expect(201);

      // The fingerprint is of the file AFTER processing: two different originals
      // that end up as the same grey JPG are the same receipt.
      expect(second.body.data).toHaveLength(1);
    });

    it('rejects what is neither a PDF nor an image', async () => {
      const transaction = await http
        .post('/api/v2/transactions')
        .set('Authorization', ana)
        .send({ date: '2026-08-12', amount: '1000', type: 'expense' })
        .expect(201);

      await http
        .post(`/api/v2/transactions/${Number(transaction.body.data.id)}/receipts`)
        .set('Authorization', ana)
        .attach('files', Buffer.from('#!/bin/sh\nrm -rf /'), {
          filename: 'travieso.sh',
          contentType: 'application/x-sh',
        })
        .expect(415);

      // A PostScript program labelled as a PDF never reaches ghostscript.
      await http
        .post(`/api/v2/transactions/${Number(transaction.body.data.id)}/receipts`)
        .set('Authorization', ana)
        .attach('files', Buffer.from('%!PS-Adobe-3.0\nshowpage\n'), {
          filename: 'recibo.pdf',
          contentType: 'application/pdf',
        })
        .expect(415);
    });

    it('deleting the transaction takes its receipts with it', async () => {
      const { transactionId } = await withReceipts(ana, anaId, [pdf('uno'), pdf('dos')]);

      await http
        .delete(`/api/v2/transactions/${transactionId}`)
        .set('Authorization', ana)
        .expect(204);

      expect(await env.prisma.receipt.count({ where: { transactionId } })).toBe(0);
    });
  });
});
