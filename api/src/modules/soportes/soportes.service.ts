import {
  Inject,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Readable } from 'node:stream';

import { RECEIPT_STORE, type ReceiptStore } from './receipt-store';
import { claveNueva, huellaDe } from './soportes.almacen';
import {
  nombreDeSoporte,
  comoLlego,
  esFaltaDeRecursos,
  optimizar,
  TAMANO_MAXIMO,
  TIPOS_DE_ENTRADA,
} from './soportes.optimizacion';
import { PrismaService } from '../../prisma/prisma.service';

/** Un archivo tal como llega del formulario. */
export interface ArchivoSubido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** La ficha de un soporte, sin el binario. Es lo que se lista en el modal. */
export interface SoporteView {
  id: bigint;
  orden: number;
  nombre_archivo: string;
  mime_type: string;
  tamano: number;
  /** Si el binario está de verdad en el almacén. */
  disponible: boolean;
}

@Injectable()
export class SoportesService implements OnModuleInit {
  private readonly logger = new Logger(SoportesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RECEIPT_STORE) private readonly store: ReceiptStore,
  ) {}

  /**
   * Decir al arrancar si el almacén está donde dice estar.
   *
   * Un almacén mal apuntado no rompe nada VISIBLE: la API sigue en pie, la
   * lista de soportes sigue llegando y lo único que cambia es que todos salen
   * como no disponibles. Eso en pantalla se lee como «no cargan las imágenes»,
   * que es lo más lejos que se puede estar de la causa.
   *
   * Pasó: `SOPORTES_DIR` llegaba con las comillas dentro del valor, así que la
   * ruta dejaba de ser absoluta y se resolvía contra el directorio de trabajo.
   * Diagnosticarlo costó leer `/proc/<pid>/environ` del proceso en producción.
   * Esta línea lo habría dicho en el primer reinicio.
   */
  async onModuleInit(): Promise<void> {
    const { ok, detail } = await this.store.check().catch((error: unknown) => ({
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }));

    if (ok) {
      this.logger.log(`Almacén de soportes: ${this.store.describe()} — ${detail}`);
      return;
    }

    this.logger.error(
      `El almacén de soportes NO está listo (${this.store.describe()}): ${detail}. ` +
        'Todos los soportes van a salir como no disponibles.',
    );
  }

  /**
   * Los soportes de un movimiento.
   *
   * ── Por qué el `userId` va en el WHERE y no en un `if` ──────────────────
   * Porque un `if` se olvida y un `where` no. Pedir los soportes de un
   * movimiento ajeno no devuelve "prohibido": devuelve la lista vacía, porque
   * para esta consulta esos soportes no existen. No hay una rama del código
   * donde la comprobación pueda saltarse.
   */
  async listar(userId: bigint, transactionId: bigint): Promise<SoporteView[]> {
    const filas = await this.prisma.soporte.findMany({
      where: { userId, transactionId },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });

    // One check per receipt, in parallel: a movement has a handful at most.
    const disponibles = await Promise.all(
      filas.map((s) => this.store.exists(s.storageKey).catch(() => false)),
    );

    return filas.map((s, indice) => ({
      id: s.id,
      orden: s.orden,
      nombre_archivo: s.nombreArchivo,
      mime_type: s.mimeType,
      tamano: s.tamano,
      // Promise.all devuelve uno por fila: el respaldo nunca se usa.
      disponible: disponibles[indice] ?? false,
    }));
  }

  /**
   * El binario de un soporte, con su ficha.
   *
   * Las TRES condiciones van juntas en el mismo `where`: el soporte, su
   * movimiento y su dueño. Pedir el soporte de otro con un id de movimiento
   * propio —o al revés— no encuentra nada.
   *
   * ── Por qué 404 y no 403 ────────────────────────────────────────────────
   * Un 403 confirma que el recurso existe. Con una lista de ids y un puñado
   * de peticiones, esa diferencia dibuja el mapa de lo que hay en la base de
   * otro. Para quien no es el dueño, aquí no hay nada, y eso es lo que se
   * responde.
   */
  async descargar(
    userId: bigint,
    transactionId: bigint,
    soporteId: bigint,
  ): Promise<{ flujo: Readable; nombre: string; mime: string; tamano: number }> {
    const soporte = await this.prisma.soporte.findFirst({
      where: { id: soporteId, transactionId, userId },
    });

    if (!soporte) throw new NotFoundException('El soporte no existe.');

    const flujo = await this.store.open(soporte.storageKey);
    if (!flujo) {
      // La ficha está y el archivo no. Es un estado posible —un almacén a
      // medio sincronizar— y decirlo así es más útil que un 404 pelado, que
      // haría pensar que el soporte nunca existió.
      throw new NotFoundException('El archivo de ese soporte no está en el almacén.');
    }

    return {
      flujo,
      nombre: soporte.nombreArchivo,
      mime: soporte.mimeType,
      tamano: soporte.tamano,
    };
  }

  /**
   * Sube uno o varios soportes a un movimiento.
   *
   * ── El orden de las comprobaciones importa ──────────────────────────────
   * La propiedad del movimiento se verifica ANTES de tocar un solo byte. Al
   * revés —optimizar y luego mirar de quién es— un desconocido podría hacer
   * trabajar al servidor con ghostscript y sharp mandando archivos a
   * movimientos que no son suyos, que es una forma barata de tumbarlo.
   *
   * ── Por qué se procesa antes de mirar si está repetido ──────────────────
   * Porque la huella es del archivo YA TRATADO, no del que llegó. Dos fotos
   * de la misma hoja tomadas con un segundo de diferencia son dos archivos
   * distintos en origen y el mismo JPG en gris a 1100px. Comparar lo que
   * llega dejaría entrar el duplicado que uno quería evitar.
   */
  async subir(
    userId: bigint,
    transactionId: bigint,
    archivos: ArchivoSubido[],
  ): Promise<SoporteView[]> {
    const movimiento = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: { category: { select: { name: true } } },
    });

    if (!movimiento) throw new NotFoundException('El movimiento no existe.');
    if (archivos.length === 0) throw new BadRequestException('No llegó ningún archivo.');

    for (const archivo of archivos) {
      if (!TIPOS_DE_ENTRADA.has(archivo.mimetype)) {
        throw new UnsupportedMediaTypeException(
          `“${archivo.originalname}” no es un PDF ni una imagen.`,
        );
      }
      if (archivo.size > TAMANO_MAXIMO) {
        throw new PayloadTooLargeException(
          `“${archivo.originalname}” pesa más de ${Math.round(TAMANO_MAXIMO / 1024 / 1024)} MB.`,
        );
      }
    }

    // El nombre sale del MOVIMIENTO, no del archivo: `IMG_4821.HEIC` no dice
    // de qué pago es, y así lo subido queda igual que lo importado.
    const concepto =
      movimiento.description ?? movimiento.merchant ?? movimiento.category?.name ?? 'Soporte';
    const fecha = movimiento.date.toISOString().slice(0, 10);

    const ultimo = await this.prisma.soporte.aggregate({
      where: { transactionId },
      _max: { orden: true },
    });
    let orden = (ultimo._max.orden ?? 0) + 1;

    for (const archivo of archivos) {
      /*
        Tratar el archivo puede fallar por DOS motivos, y no se contestan igual.

        ── No sé abrirlo ─────────────────────────────────────────────────────
        El caso real es el HEIC del iPhone: está en `TIPOS_DE_ENTRADA` porque
        es un formato de imagen legítimo, pero la librería que las procesa solo
        lo entiende si se compiló con soporte para él —y casi nunca lo está,
        porque va aparte por licencia—. Es definitivo: por más que se reintente
        ese archivo no va a entrar, así que lo que hay que decir es con qué
        volver.

        ── No PUEDO ahora mismo ──────────────────────────────────────────────
        El servidor se quedó sin hilos o sin memoria para tratar la imagen. El
        archivo está perfecto y reintentar es exactamente lo que hay que hacer.

        Iban por el mismo camino, y el resultado era el peor de los dos: una
        captura PNG recibía «este servidor no sabe abrir ese formato, vuelve a
        intentarlo con un JPG o un PNG» —un consejo imposible de seguir, porque
        ya era un PNG— y la causa real quedaba escondida en el paréntesis.

        El código de estado también cambia, y no es un detalle: 415 dice «no
        mandes esto», 503 dice «vuelve a mandarlo». Son instrucciones opuestas.
      */
      const optimizado = await optimizar(archivo.buffer, archivo.mimetype).catch(
        (causa: unknown) => {
          const detalle = causa instanceof Error ? causa.message : 'error al procesar la imagen';

          if (esFaltaDeRecursos(causa)) {
            /*
              Se guarda lo que llegó, sin tratar.

              Tratar la imagen es una MEJORA —gris, 1100px, un tercio del
              peso—, no un requisito: el recibo se ve igual sin ella. Tirar el
              soporte porque al servidor le faltaban hilos en ese segundo es
              cambiar una mejora por un fallo.

              Y el fallo era REAL y frecuente: en un plan compartido la cuota
              de procesos va y viene, así que pegar una captura funcionaba o no
              según lo que estuviera haciendo el vecino. Pedirle a alguien que
              «espere unos segundos y vuelva a intentarlo» con el recibo
              delante es pedirle que haga de reintento manual.

              Solo para lo que el visor sabe abrir. Un HEIC sin tratar sería un
              archivo que después no se puede mirar: ahí el problema es el
              formato, y ceder no arregla nada.
            */
            const sinTratar = comoLlego(archivo.buffer, archivo.mimetype);
            if (sinTratar) {
              this.logger.warn(
                `Sin recursos para tratar “${archivo.originalname}”: se guarda tal cual. (${detalle})`,
              );
              return sinTratar;
            }

            throw new ServiceUnavailableException(
              `No se pudo procesar “${archivo.originalname}”: al servidor se le acabaron los ` +
                `recursos para tratar la imagen. No es el archivo. Espera unos segundos y ` +
                `vuelve a intentarlo. (${detalle})`,
            );
          }

          throw new UnsupportedMediaTypeException(
            `No se pudo procesar “${archivo.originalname}”: este servidor no sabe abrir ese formato. ` +
              `Vuelve a intentarlo con un JPG, un PNG o un PDF. (${detalle})`,
          );
        },
      );
      const { contenido, mime, extension } = optimizado;
      const huella = huellaDe(contenido);

      // Reintentar la misma subida no duplica: el único de (movimiento,
      // huella) lo impediría en la base, pero fallar con un 500 no es una
      // respuesta; se salta y ya.
      const repetido = await this.prisma.soporte.findFirst({
        where: { transactionId, huella },
      });
      if (repetido) continue;

      const storageKey = claveNueva(userId, extension);
      // El archivo primero y la ficha después: si se corta en medio queda un
      // binario que nadie alcanza, que es inofensivo. Al revés quedaría un
      // soporte que la aplicación promete y no puede enseñar.
      await this.store.save(storageKey, contenido, mime);

      await this.prisma.soporte.create({
        data: {
          userId,
          transactionId,
          orden,
          nombreArchivo: nombreDeSoporte(concepto, fecha, extension),
          mimeType: mime,
          storageKey,
          tamano: contenido.length,
          huella,
        },
      });

      orden += 1;
    }

    return this.listar(userId, transactionId);
  }

  /**
   * Borra un soporte.
   *
   * El binario se queda en el almacén a propósito: es un archivo huérfano que
   * nadie alcanza —no hay ruta que llegue a él sin su ficha— y borrarlo aquí
   * haría que un fallo a mitad dejara una ficha apuntando a nada, que sí se
   * ve. La basura se recoge aparte, si alguna vez hace falta.
   */
  async eliminar(userId: bigint, transactionId: bigint, soporteId: bigint): Promise<void> {
    const soporte = await this.prisma.soporte.findFirst({
      where: { id: soporteId, transactionId, userId },
      select: { storageKey: true },
    });
    if (!soporte) throw new NotFoundException('El soporte no existe.');

    await this.prisma.soporte.deleteMany({ where: { id: soporteId, transactionId, userId } });
    await this.removeFiles([soporte.storageKey]);
  }

  /** Storage keys of the receipts of these movements; read BEFORE deleting them (the rows cascade). */
  async keysOf(
    userId: bigint,
    where: { transactionId?: bigint; transferGroupId?: string },
  ): Promise<string[]> {
    const rows = await this.prisma.soporte.findMany({
      where: {
        userId,
        transaction: {
          userId,
          ...(where.transactionId !== undefined && { id: where.transactionId }),
          ...(where.transferGroupId !== undefined && { transferGroupId: where.transferGroupId }),
        },
      },
      select: { storageKey: true },
    });
    return rows.map((row) => row.storageKey);
  }

  /**
   * Deletes the files of receipts whose rows are already gone (phase 6.9).
   *
   * After the database delete, never before: a file without a row is an
   * orphan that costs a few kilobytes; a row without a file is a receipt
   * that shows up broken. If the store fails here, the row is still gone and
   * the failure is logged with the keys, so the orphan can be found.
   */
  async removeFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.store.remove(keys);
    } catch (error) {
      this.logger.error(
        `Could not delete ${keys.length} receipt file(s): ${(error as Error).message} — keys: ${keys.join(', ')}`,
      );
    }
  }
}
