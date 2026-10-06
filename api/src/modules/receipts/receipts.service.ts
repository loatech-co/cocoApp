import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Readable } from 'node:stream';

import { RECEIPT_STORE, type ReceiptStore } from './receipt-store';
import {
  receiptFileName,
  asReceived,
  isOutOfResources,
  optimize,
  MAX_UPLOAD_BYTES,
  INPUT_TYPES,
  matchesDeclaredType,
  type OptimizedReceipt,
} from './receipts.optimization';
import { ReceiptsRepository } from './receipts.repository';
import { newStorageKey, hashOf } from './receipts.storage';
import {
  BadRequestError,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  UnsupportedMediaTypeError,
} from '../../common/errors/domain-error';

/** Un archivo tal como llega del formulario. */
export interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** La ficha de un soporte, sin el binario (el dominio). Es lo que se lista en el modal. */
export interface Receipt {
  id: bigint;
  /** Order among the transaction's receipts. */
  position: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Si el binario está de verdad en el almacén. */
  isAvailable: boolean;
}

@Injectable()
export class ReceiptsService implements OnModuleInit {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly repository: ReceiptsRepository,
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
    const { ok: isReady, detail } = await this.store.check().catch((error: unknown) => ({
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }));

    if (isReady) {
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
  async list(userId: bigint, transactionId: bigint): Promise<Receipt[]> {
    const rows = await this.repository.findByTransaction(userId, transactionId);

    // One check per receipt, in parallel: a movement has a handful at most.
    const availability = await Promise.all(
      rows.map((s) => this.store.exists(s.storageKey).catch(() => false)),
    );

    return rows.map((s, index) => ({
      id: s.id,
      position: s.position,
      fileName: s.fileName,
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
      // Promise.all devuelve uno por fila: el respaldo nunca se usa.
      isAvailable: availability[index] ?? false,
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
  async download(
    userId: bigint,
    transactionId: bigint,
    receiptId: bigint,
  ): Promise<{ stream: Readable; fileName: string; mime: string; sizeBytes: number }> {
    const receipt = await this.repository.findOne(userId, transactionId, receiptId);

    if (!receipt) throw new NotFoundError('El soporte no existe.');

    const stream = await this.store.open(receipt.storageKey);
    if (!stream) {
      // La ficha está y el archivo no. Es un estado posible —un almacén a
      // medio sincronizar— y decirlo así es más útil que un 404 pelado, que
      // haría pensar que el soporte nunca existió.
      throw new NotFoundError('El archivo de ese soporte no está en el almacén.', {
        code: 'receipt_file_missing',
      });
    }

    return {
      stream,
      fileName: receipt.fileName,
      mime: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
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
  async upload(userId: bigint, transactionId: bigint, files: IncomingFile[]): Promise<Receipt[]> {
    const transaction = await this.repository.findMovementForUpload(userId, transactionId);

    if (!transaction) throw new NotFoundError('El movimiento no existe.');
    validateUploads(files);

    // El nombre sale del MOVIMIENTO, no del archivo: `IMG_4821.HEIC` no dice
    // de qué pago es, y así lo subido queda igual que lo importado.
    const concept =
      transaction.description ?? transaction.merchant ?? transaction.category?.name ?? 'Soporte';
    const date = transaction.date.toISOString().slice(0, 10);

    let position = ((await this.repository.maxOrder(userId, transactionId)) ?? 0) + 1;

    for (const file of files) {
      const { content, mime, extension } = await this.optimizeOrFail(file);
      const hash = hashOf(content);

      // Reintentar la misma subida no duplica: el único de (movimiento,
      // huella) lo impediría en la base, pero fallar con un 500 no es una
      // respuesta; se salta y ya.
      if (await this.repository.existsWithHash(userId, transactionId, hash)) continue;

      const storageKey = newStorageKey(userId, extension);
      // El archivo primero y la ficha después: si se corta en medio queda un
      // binario que nadie alcanza, que es inofensivo. Al revés quedaría un
      // soporte que la aplicación promete y no puede enseñar.
      await this.store.save(storageKey, content, mime);

      await this.repository.create({
        userId,
        transactionId,
        position,
        fileName: receiptFileName(concept, date, extension),
        mimeType: mime,
        storageKey,
        sizeBytes: content.length,
        contentHash: hash,
      });

      position += 1;
    }

    return this.list(userId, transactionId);
  }

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
  private async optimizeOrFail(file: IncomingFile): Promise<OptimizedReceipt> {
    return optimize(file.buffer, file.mimetype).catch((cause: unknown) => {
      const detail = cause instanceof Error ? cause.message : 'error al procesar la imagen';

      if (isOutOfResources(cause)) {
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
        const unprocessed = asReceived(file.buffer, file.mimetype);
        if (unprocessed) {
          this.logger.warn(
            `Sin recursos para tratar “${file.originalname}”: se guarda tal cual. (${detail})`,
          );
          return unprocessed;
        }

        throw new ServiceUnavailableError(
          `No se pudo procesar “${file.originalname}”: al servidor se le acabaron los ` +
            `recursos para tratar la imagen. No es el archivo. Espera unos segundos y ` +
            `vuelve a intentarlo. (${detail})`,
          { code: 'image_processing_unavailable' },
        );
      }

      throw new UnsupportedMediaTypeError(
        `No se pudo procesar “${file.originalname}”: este servidor no sabe abrir ese formato. ` +
          `Vuelve a intentarlo con un JPG, un PNG o un PDF. (${detail})`,
        { code: 'image_format_unsupported' },
      );
    });
  }

  /**
   * Borra un soporte.
   *
   * El binario se queda en el almacén a propósito: es un archivo huérfano que
   * nadie alcanza —no hay ruta que llegue a él sin su ficha— y borrarlo aquí
   * haría que un fallo a mitad dejara una ficha apuntando a nada, que sí se
   * ve. La basura se recoge aparte, si alguna vez hace falta.
   */
  async remove(userId: bigint, transactionId: bigint, receiptId: bigint): Promise<void> {
    const receipt = await this.repository.findOne(userId, transactionId, receiptId);
    if (!receipt) throw new NotFoundError('El soporte no existe.');

    await this.repository.delete(userId, transactionId, receiptId);
    await this.removeFiles([receipt.storageKey]);
  }

  /** Storage keys of the receipts of these movements; read BEFORE deleting them (the rows cascade). */
  async keysOf(
    userId: bigint,
    where: { transactionId?: bigint; transferGroupId?: string },
  ): Promise<string[]> {
    return this.repository.storageKeysOf(userId, where);
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

/** Type and size of every file, before a single byte is processed. */
function validateUploads(files: readonly IncomingFile[]): void {
  if (files.length === 0)
    throw new BadRequestError('No llegó ningún archivo.', { code: 'no_files' });

  for (const file of files) {
    if (!INPUT_TYPES.has(file.mimetype)) {
      throw new UnsupportedMediaTypeError(`“${file.originalname}” no es un PDF ni una imagen.`, {
        code: 'file_type_not_allowed',
      });
    }
    // The declared type comes from the client; the bytes decide (see FIRMAS).
    if (!matchesDeclaredType(file.buffer, file.mimetype)) {
      throw new UnsupportedMediaTypeError(
        `“${file.originalname}” no es lo que dice ser: su contenido no es un ${file.mimetype}.`,
        { code: 'file_content_mismatch' },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeError(
        `“${file.originalname}” pesa más de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
        { code: 'file_too_large' },
      );
    }
  }
}
