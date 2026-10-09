import { rmSync } from 'node:fs';
import sharp from 'sharp';
import request from 'supertest';

import { startApp, type TestEnvironment } from './helpers/app';
import { RECEIPT_STORE, type ReceiptStore } from '../src/modules/receipts/receipt-store';
import { newStorageKey, storeFolder, hashOf } from '../src/modules/receipts/receipts.storage';

/**
 * Soportes — el recibo de un movimiento.
 *
 * Lo que se protege aquí no es que la función devuelva lo que debe: es que NO
 * devuelva lo que no debe. Un recibo lleva el nombre del titular, un número de
 * cuenta y a veces un consumo que dice si la casa estuvo vacía en agosto. La
 * mitad de estas pruebas comprueban puertas cerradas.
 */
describe('Soportes (e2e)', () => {
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
    // El almacén de pruebas se va entero: son bytes de mentira, pero acumular
    // basura entre corridas acaba escondiendo un fallo real detrás de un
    // archivo que quedó de la vez pasada.
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

  /** Un movimiento con sus soportes, escritos como los escribe el importador. */
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
    // Un PDF de verdad empieza por %PDF-: así el content-type no es una
    // promesa que nadie comprueba.
    bytes: Buffer.from(`%PDF-1.4\n${text}\n%%EOF\n`),
  });

  // ── Puertas cerradas ──────────────────────────────────────────────────────

  describe('Quién NO puede ver un soporte', () => {
    it('sin sesión, 401 en listar y en descargar', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      await http.get(`/api/v2/transactions/${transactionId}/receipts`).expect(401);
      await http
        .get(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .expect(401);
    });

    it('con un token inventado, 401', async () => {
      const { transactionId } = await withReceipts(ana, anaId, [pdf('recibo')]);

      await http
        .get(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', 'Bearer no-soy-un-token')
        .expect(401);
    });

    it('Beto no ve los soportes de un movimiento de Ana', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      // La lista no dice "prohibido": para esa consulta esos soportes no
      // existen. Decir "prohibido" confirmaría que el movimiento es de alguien.
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

    it('Beto no puede colar el soporte de Ana por un movimiento suyo', async () => {
      // El ataque obvio contra una comprobación a medias: el id del movimiento
      // es mío, el del soporte es de otro. Las tres condiciones van en el mismo
      // WHERE justamente por esto.
      const anas = await withReceipts(ana, anaId, [pdf('el-de-ana')]);
      const betos = await withReceipts(beto, betoId, [pdf('el-de-beto')]);

      await http
        .get(`/api/v2/transactions/${betos.transactionId}/receipts/${anas.receipts[0]!.id}`)
        .set('Authorization', beto)
        .expect(404);
    });

    it('Beto no puede subir un soporte a un movimiento de Ana', async () => {
      const { transactionId } = await withReceipts(ana, anaId, [pdf('recibo')]);

      const image = await sharp({
        create: { width: 400, height: 500, channels: 3, background: { r: 10, g: 10, b: 10 } },
      })
        .png()
        .toBuffer();

      // 404 y no 403: confirmar que el movimiento existe ya es contar algo de
      // la base de otro.
      await http
        .post(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', beto)
        .attach('files', image, { filename: 'x.png', contentType: 'image/png' })
        .expect(404);

      // Y no se creó nada: la propiedad se comprueba ANTES de procesar.
      expect(await env.prisma.receipt.count({ where: { transactionId } })).toBe(1);
    });

    it('sin sesión no se sube ni se borra', async () => {
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

    it('Beto no puede borrar un soporte de Ana', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      await http
        .delete(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .set('Authorization', beto)
        .expect(404);

      expect(await env.prisma.receipt.count({ where: { transactionId } })).toBe(1);
    });

    it('una clave que se sale del almacén no entrega nada', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      // Nadie puede escribir esto desde fuera —la clave la genera el servidor—
      // pero si algún día una llega torcida, el resolver es lo único que queda
      // entre eso y el sistema de archivos.
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

  // ── Lo que sí ─────────────────────────────────────────────────────────────

  describe('Lo que ve el dueño', () => {
    it('lista sus soportes en orden', async () => {
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
      // La ficha NO lleva la ruta del almacén. Enseñarla no abriría ninguna
      // puerta —no hay servidor de archivos detrás— pero dibuja el mapa.
      expect(r.body.data[0]).not.toHaveProperty('storage_key');
    });

    it('descarga el archivo, con su tipo y sus bytes', async () => {
      const first = pdf('recibo-de-agosto');
      const { transactionId, receipts } = await withReceipts(ana, anaId, [first]);

      const r = await http
        .get(`/api/v2/transactions/${transactionId}/receipts/${receipts[0]!.id}`)
        .set('Authorization', ana)
        .expect(200);

      expect(r.headers['content-type']).toContain('application/pdf');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['cache-control']).toContain('no-store');
      // Los bytes, exactos: el interceptor que envuelve todo en `{data, meta}`
      // tiene que dejar pasar un flujo sin tocarlo.
      expect(Buffer.from(r.body).equals(first.bytes)).toBe(true);
    });

    it('un movimiento sin soportes devuelve una lista vacía, no un error', async () => {
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

    it('la ficha queda sin archivo si el almacén no lo tiene', async () => {
      const { transactionId, receipts } = await withReceipts(ana, anaId, [pdf('recibo')]);

      // Un almacén a medio sincronizar: la fila existe, el binario todavía no.
      await env.prisma.receipt.update({
        where: { id: receipts[0]!.id },
        data: { storageKey: `${anaId}/no-existe.pdf` },
      });

      const r = await http
        .get(`/api/v2/transactions/${transactionId}/receipts`)
        .set('Authorization', ana)
        .expect(200);

      // Se lista igual, marcado como no isAvailable: esconderlo haría creer que
      // el soporte nunca se cargó, que es un problema distinto.
      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0].isAvailable).toBe(false);
    });

    it('sube un soporte y lo deja en gris, liviano y con el nombre del movimiento', async () => {
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

      // Una imagen A COLOR y grande: es lo que llega de la cámara de un móvil,
      // y es donde se nota si el tratamiento corrió o no.
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

      // El nombre sale del MOVIMIENTO, no del archivo, y la barra que no cabe
      // en un nombre de archivo se cambia por un guion —igual que en el lote—.
      expect(receipt.fileName).toBe('PILA - Seguridad Social - 2026-08-12.jpg');
      expect(receipt.mimeType).toBe('image/jpeg');
      expect(receipt.position).toBe(1);

      // Y el archivo guardado es gris y de 1100 de ancho, no la imagen original.
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

    it('el "i de N" se recalcula al agregar, sin renombrar lo anterior', async () => {
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

      // El tercero continúa la cuenta, y los dos primeros NO cambian de name:
      // el total no está horneado en ninguno, se cuenta al mirarlos.
      expect(third.body.data.map((s: { position: number }) => s.position)).toEqual([1, 2, 3]);
      expect(new Set(third.body.data.map((s: { fileName: string }) => s.fileName))).toEqual(
        new Set(['Claro Movil - 2026-08-12.jpg']),
      );
    });

    it('subir el mismo archivo dos veces no lo duplica', async () => {
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

      // La huella es del archivo YA TRATADO: dos originales distintos que
      // acaban en el mismo JPG en gris son el mismo soporte.
      expect(second.body.data).toHaveLength(1);
    });

    it('rechaza lo que no es un PDF ni una imagen', async () => {
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

    it('borrar el movimiento se lleva sus soportes', async () => {
      const { transactionId } = await withReceipts(ana, anaId, [pdf('uno'), pdf('dos')]);

      await http
        .delete(`/api/v2/transactions/${transactionId}`)
        .set('Authorization', ana)
        .expect(204);

      expect(await env.prisma.receipt.count({ where: { transactionId } })).toBe(0);
    });
  });
});
