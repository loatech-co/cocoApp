import { rmSync } from 'node:fs';

import request from 'supertest';

import { claveNueva, carpetaDelAlmacen, guardar, huellaDe } from '../src/modules/soportes/soportes.almacen';
import { levantarApp, type EntornoDePruebas } from './helpers/app';

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
      await guardar(storageKey, c.bytes);
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
        .get(`/api/v1/transactions/${transactionId}/soportes/${soportes[0].id}`)
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
        .get(`/api/v1/transactions/${transactionId}/soportes/${soportes[0].id}`)
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
        .get(`/api/v1/transactions/${deBeto.transactionId}/soportes/${deAna.soportes[0].id}`)
        .set('Authorization', beto)
        .expect(404);
    });

    it('una clave que se sale del almacén no entrega nada', async () => {
      const { transactionId, soportes } = await conSoportes(ana, anaId, [pdf('recibo')]);

      // Nadie puede escribir esto desde fuera —la clave la genera el servidor—
      // pero si algún día una llega torcida, el resolver es lo único que queda
      // entre eso y el sistema de archivos.
      await entorno.prisma.soporte.update({
        where: { id: soportes[0].id },
        data: { storageKey: '../../../../../../etc/passwd' },
      });

      await http
        .get(`/api/v1/transactions/${transactionId}/soportes/${soportes[0].id}`)
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
        .get(`/api/v1/transactions/${transactionId}/soportes/${soportes[0].id}`)
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
        where: { id: soportes[0].id },
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
