import { rmSync } from 'node:fs';
import sharp from 'sharp';
import request from 'supertest';

import { levantarApp, type EntornoDePruebas } from './helpers/app';
import { RECEIPT_STORE, type ReceiptStore } from '../src/modules/soportes/receipt-store';
import { claveNueva, carpetaDelAlmacen, huellaDe } from '../src/modules/soportes/soportes.almacen';

/**
 * Soportes — el recibo de un movimiento.
 *
 * Lo que se protege aquí no es que la función devuelva lo que debe: es que NO
 * devuelva lo que no debe. Un recibo lleva el nombre del titular, un número de
 * cuenta y a veces un consumo que dice si la casa estuvo vacía en agosto. La
 * mitad de estas pruebas comprueban puertas cerradas.
 */
describe('Soportes (e2e)', () => {
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;

  let ana: string;
  let beto: string;
  let anaId: bigint;
  let betoId: bigint;

  beforeAll(async () => {
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
    // El almacén de pruebas se va entero: son bytes de mentira, pero acumular
    // basura entre corridas acaba escondiendo un fallo real detrás de un
    // archivo que quedó de la vez pasada.
    rmSync(carpetaDelAlmacen(), { recursive: true, force: true });
  });

  beforeEach(async () => {
    await entorno.limpiar();
    const a = await entorno.crearUsuario({ displayName: 'Ana' });
    const b = await entorno.crearUsuario({ displayName: 'Beto' });
    ana = entorno.como(a);
    beto = entorno.como(b);
    anaId = a.id;
    betoId = b.id;
  });

  /** Un movimiento con sus soportes, escritos como los escribe el importador. */
  const conSoportes = async (
    auth: string,
    userId: bigint,
    contenidos: { nombre: string; mime: string; ext: string; bytes: Buffer }[],
  ) => {
    const movimiento = await http
      .post('/api/v1/transactions')
      .set('Authorization', auth)
      .send({ date: '2026-08-12', amount: '120000', type: 'expense' })
      .expect(201);

    const transactionId = BigInt(movimiento.body.data.id);
    const soportes = [];

    for (const [i, c] of contenidos.entries()) {
      const storageKey = claveNueva(userId, c.ext);
      // Through the app's store, so the suite runs against disk or the Storage bucket (6.9).
      await entorno.app.get<ReceiptStore>(RECEIPT_STORE).save(storageKey, c.bytes, c.mime);
      soportes.push(
        await entorno.prisma.soporte.create({
          data: {
            userId,
            transactionId,
            orden: i + 1,
            nombreArchivo: c.nombre,
            mimeType: c.mime,
            storageKey,
            tamano: c.bytes.length,
            huella: huellaDe(c.bytes),
          },
        }),
      );
    }

    return { transactionId, soportes };
  };

  const pdf = (texto: string) => ({
    nombre: `${texto}.pdf`,
    mime: 'application/pdf',
    ext: 'pdf',
    // Un PDF de verdad empieza por %PDF-: así el content-type no es una
    // promesa que nadie comprueba.
    bytes: Buffer.from(`%PDF-1.4\n${texto}\n%%EOF\n`),
  });

  // ── Puertas cerradas ──────────────────────────────────────────────────────

  describe('Quién NO puede ver un soporte', () => {
    it('sin sesión, 401 en listar y en descargar', async () => {
      const { transactionId, soportes } = await conSoportes(ana, anaId, [pdf('recibo')]);

      await http.get(`/api/v1/transactions/${transactionId}/soportes`).expect(401);
      await http
        .get(`/api/v1/transactions/${transactionId}/soportes/${soportes[0]!.id}`)
        .expect(401);
    });

    it('con un token inventado, 401', async () => {
      const { transactionId } = await conSoportes(ana, anaId, [pdf('recibo')]);

      await http
        .get(`/api/v1/transactions/${transactionId}/soportes`)
        .set('Authorization', 'Bearer no-soy-un-token')
        .expect(401);
    });

    it('Beto no ve los soportes de un movimiento de Ana', async () => {
      const { transactionId, soportes } = await conSoportes(ana, anaId, [pdf('recibo')]);

      // La lista no dice "prohibido": para esa consulta esos soportes no
      // existen. Decir "prohibido" confirmaría que el movimiento es de alguien.
      const lista = await http
        .get(`/api/v1/transactions/${transactionId}/soportes`)
        .set('Authorization', beto)
        .expect(200);
      expect(lista.body.data).toEqual([]);

      await http
        .get(`/api/v1/transactions/${transactionId}/soportes/${soportes[0]!.id}`)
        .set('Authorization', beto)
        .expect(404);
    });

    it('Beto no puede colar el soporte de Ana por un movimiento suyo', async () => {
      // El ataque obvio contra una comprobación a medias: el id del movimiento
      // es mío, el del soporte es de otro. Las tres condiciones van en el mismo
      // WHERE justamente por esto.
      const deAna = await conSoportes(ana, anaId, [pdf('el-de-ana')]);
      const deBeto = await conSoportes(beto, betoId, [pdf('el-de-beto')]);

      await http
        .get(`/api/v1/transactions/${deBeto.transactionId}/soportes/${deAna.soportes[0]!.id}`)
        .set('Authorization', beto)
        .expect(404);
    });

    it('Beto no puede subir un soporte a un movimiento de Ana', async () => {
      const { transactionId } = await conSoportes(ana, anaId, [pdf('recibo')]);

      const hoja = await sharp({
        create: { width: 400, height: 500, channels: 3, background: { r: 10, g: 10, b: 10 } },
      })
        .png()
        .toBuffer();

      // 404 y no 403: confirmar que el movimiento existe ya es contar algo de
      // la base de otro.
      await http
        .post(`/api/v1/transactions/${transactionId}/soportes`)
        .set('Authorization', beto)
        .attach('archivos', hoja, { filename: 'x.png', contentType: 'image/png' })
        .expect(404);

      // Y no se creó nada: la propiedad se comprueba ANTES de procesar.
      expect(await entorno.prisma.soporte.count({ where: { transactionId } })).toBe(1);
    });

    it('sin sesión no se sube ni se borra', async () => {
      const { transactionId, soportes } = await conSoportes(ana, anaId, [pdf('recibo')]);

      await http
        .post(`/api/v1/transactions/${transactionId}/soportes`)
        .attach('archivos', Buffer.from('%PDF-1.4\n%%EOF\n'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        })
        .expect(401);

      await http
        .delete(`/api/v1/transactions/${transactionId}/soportes/${soportes[0]!.id}`)
        .expect(401);
    });

    it('Beto no puede borrar un soporte de Ana', async () => {
      const { transactionId, soportes } = await conSoportes(ana, anaId, [pdf('recibo')]);

      await http
        .delete(`/api/v1/transactions/${transactionId}/soportes/${soportes[0]!.id}`)
        .set('Authorization', beto)
        .expect(404);

      expect(await entorno.prisma.soporte.count({ where: { transactionId } })).toBe(1);
    });

    it('una clave que se sale del almacén no entrega nada', async () => {
      const { transactionId, soportes } = await conSoportes(ana, anaId, [pdf('recibo')]);

      // Nadie puede escribir esto desde fuera —la clave la genera el servidor—
      // pero si algún día una llega torcida, el resolver es lo único que queda
      // entre eso y el sistema de archivos.
      await entorno.prisma.soporte.update({
        where: { id: soportes[0]!.id },
        data: { storageKey: '../../../../../../etc/passwd' },
      });

      await http
        .get(`/api/v1/transactions/${transactionId}/soportes/${soportes[0]!.id}`)
        .set('Authorization', ana)
        .expect(404);
    });
  });

  // ── Lo que sí ─────────────────────────────────────────────────────────────

  describe('Lo que ve el dueño', () => {
    it('lista sus soportes en orden', async () => {
      const { transactionId } = await conSoportes(ana, anaId, [
        pdf('uno'),
        pdf('dos'),
        pdf('tres'),
      ]);

      const r = await http
        .get(`/api/v1/transactions/${transactionId}/soportes`)
        .set('Authorization', ana)
        .expect(200);

      expect(r.body.data.map((s: { orden: number }) => s.orden)).toEqual([1, 2, 3]);
      expect(r.body.data[0].nombre_archivo).toBe('uno.pdf');
      expect(r.body.data.every((s: { disponible: boolean }) => s.disponible)).toBe(true);
      // La ficha NO lleva la ruta del almacén. Enseñarla no abriría ninguna
      // puerta —no hay servidor de archivos detrás— pero dibuja el mapa.
      expect(r.body.data[0]).not.toHaveProperty('storage_key');
    });

    it('descarga el archivo, con su tipo y sus bytes', async () => {
      const uno = pdf('recibo-de-agosto');
      const { transactionId, soportes } = await conSoportes(ana, anaId, [uno]);

      const r = await http
        .get(`/api/v1/transactions/${transactionId}/soportes/${soportes[0]!.id}`)
        .set('Authorization', ana)
        .expect(200);

      expect(r.headers['content-type']).toContain('application/pdf');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['cache-control']).toContain('no-store');
      // Los bytes, exactos: el interceptor que envuelve todo en `{data, meta}`
      // tiene que dejar pasar un flujo sin tocarlo.
      expect(Buffer.from(r.body).equals(uno.bytes)).toBe(true);
    });

    it('un movimiento sin soportes devuelve una lista vacía, no un error', async () => {
      const movimiento = await http
        .post('/api/v1/transactions')
        .set('Authorization', ana)
        .send({ date: '2026-08-12', amount: '1000', type: 'expense' })
        .expect(201);

      const r = await http
        .get(`/api/v1/transactions/${Number(movimiento.body.data.id)}/soportes`)
        .set('Authorization', ana)
        .expect(200);

      expect(r.body.data).toEqual([]);
    });

    it('la ficha queda sin archivo si el almacén no lo tiene', async () => {
      const { transactionId, soportes } = await conSoportes(ana, anaId, [pdf('recibo')]);

      // Un almacén a medio sincronizar: la fila existe, el binario todavía no.
      await entorno.prisma.soporte.update({
        where: { id: soportes[0]!.id },
        data: { storageKey: `${anaId}/no-existe.pdf` },
      });

      const r = await http
        .get(`/api/v1/transactions/${transactionId}/soportes`)
        .set('Authorization', ana)
        .expect(200);

      // Se lista igual, marcado como no disponible: esconderlo haría creer que
      // el soporte nunca se cargó, que es un problema distinto.
      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0].disponible).toBe(false);
    });

    it('sube un soporte y lo deja en gris, liviano y con el nombre del movimiento', async () => {
      const movimiento = await http
        .post('/api/v1/transactions')
        .set('Authorization', ana)
        .send({
          date: '2026-08-12',
          amount: '120000',
          type: 'expense',
          description: 'PILA / Seguridad Social',
        })
        .expect(201);

      const id = Number(movimiento.body.data.id);

      // Una imagen A COLOR y grande: es lo que llega de la cámara de un móvil,
      // y es donde se nota si el tratamiento corrió o no.
      const color = await sharp({
        create: { width: 2400, height: 3000, channels: 3, background: { r: 200, g: 40, b: 40 } },
      })
        .png()
        .toBuffer();

      const r = await http
        .post(`/api/v1/transactions/${id}/soportes`)
        .set('Authorization', ana)
        .attach('archivos', color, { filename: 'IMG_4821.PNG', contentType: 'image/png' })
        .expect(201);

      expect(r.body.data).toHaveLength(1);
      const soporte = r.body.data[0];

      // El nombre sale del MOVIMIENTO, no del archivo, y la barra que no cabe
      // en un nombre de archivo se cambia por un guion —igual que en el lote—.
      expect(soporte.nombre_archivo).toBe('PILA - Seguridad Social - 2026-08-12.jpg');
      expect(soporte.mime_type).toBe('image/jpeg');
      expect(soporte.orden).toBe(1);

      // Y el archivo guardado es gris y de 1100 de ancho, no la imagen original.
      const guardado = await entorno.prisma.soporte.findFirst({
        where: { transactionId: BigInt(id) },
      });
      const flujo = await entorno.app.get<ReceiptStore>(RECEIPT_STORE).open(guardado!.storageKey);
      const bytes = Buffer.concat(await flujo!.toArray());
      const meta = await sharp(bytes).metadata();

      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(1100);
      expect(meta.channels).toBe(1);
      expect(bytes.length).toBeLessThan(color.length / 4);
    });

    it('el "i de N" se recalcula al agregar, sin renombrar lo anterior', async () => {
      const movimiento = await http
        .post('/api/v1/transactions')
        .set('Authorization', ana)
        .send({ date: '2026-08-12', amount: '90000', type: 'expense', description: 'Claro Movil' })
        .expect(201);

      const id = Number(movimiento.body.data.id);

      const hoja = (tono: number) =>
        sharp({
          create: {
            width: 800,
            height: 1000,
            channels: 3,
            background: { r: tono, g: tono, b: tono },
          },
        })
          .png()
          .toBuffer();

      const dos = await http
        .post(`/api/v1/transactions/${id}/soportes`)
        .set('Authorization', ana)
        .attach('archivos', await hoja(10), { filename: 'a.png', contentType: 'image/png' })
        .attach('archivos', await hoja(120), { filename: 'b.png', contentType: 'image/png' })
        .expect(201);

      expect(dos.body.data.map((s: { orden: number }) => s.orden)).toEqual([1, 2]);

      const tres = await http
        .post(`/api/v1/transactions/${id}/soportes`)
        .set('Authorization', ana)
        .attach('archivos', await hoja(230), { filename: 'c.png', contentType: 'image/png' })
        .expect(201);

      // El tercero continúa la cuenta, y los dos primeros NO cambian de nombre:
      // el total no está horneado en ninguno, se cuenta al mirarlos.
      expect(tres.body.data.map((s: { orden: number }) => s.orden)).toEqual([1, 2, 3]);
      expect(
        new Set(tres.body.data.map((s: { nombre_archivo: string }) => s.nombre_archivo)),
      ).toEqual(new Set(['Claro Movil - 2026-08-12.jpg']));
    });

    it('subir el mismo archivo dos veces no lo duplica', async () => {
      const movimiento = await http
        .post('/api/v1/transactions')
        .set('Authorization', ana)
        .send({ date: '2026-08-12', amount: '90000', type: 'expense', description: 'Agua' })
        .expect(201);

      const id = Number(movimiento.body.data.id);
      const hoja = await sharp({
        create: { width: 600, height: 800, channels: 3, background: { r: 90, g: 90, b: 90 } },
      })
        .png()
        .toBuffer();

      await http
        .post(`/api/v1/transactions/${id}/soportes`)
        .set('Authorization', ana)
        .attach('archivos', hoja, { filename: 'recibo.png', contentType: 'image/png' })
        .expect(201);

      const segunda = await http
        .post(`/api/v1/transactions/${id}/soportes`)
        .set('Authorization', ana)
        .attach('archivos', hoja, { filename: 'otro-nombre.png', contentType: 'image/png' })
        .expect(201);

      // La huella es del archivo YA TRATADO: dos originales distintos que
      // acaban en el mismo JPG en gris son el mismo soporte.
      expect(segunda.body.data).toHaveLength(1);
    });

    it('rechaza lo que no es un PDF ni una imagen', async () => {
      const movimiento = await http
        .post('/api/v1/transactions')
        .set('Authorization', ana)
        .send({ date: '2026-08-12', amount: '1000', type: 'expense' })
        .expect(201);

      await http
        .post(`/api/v1/transactions/${Number(movimiento.body.data.id)}/soportes`)
        .set('Authorization', ana)
        .attach('archivos', Buffer.from('#!/bin/sh\nrm -rf /'), {
          filename: 'travieso.sh',
          contentType: 'application/x-sh',
        })
        .expect(415);
    });

    it('borrar el movimiento se lleva sus soportes', async () => {
      const { transactionId } = await conSoportes(ana, anaId, [pdf('uno'), pdf('dos')]);

      await http
        .delete(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', ana)
        .expect(204);

      expect(await entorno.prisma.soporte.count({ where: { transactionId } })).toBe(0);
    });
  });
});
