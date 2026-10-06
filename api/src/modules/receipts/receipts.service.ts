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

/** A file as it arrives from the form. */
export interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** A receipt's row, without the binary (the domain). It is what the modal lists. */
export interface Receipt {
  id: bigint;
  /** Order among the transaction's receipts. */
  position: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Whether the binary really is in the store. */
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
   * Say at start-up whether the store is where it says it is.
   *
   * A mis-pointed store breaks nothing VISIBLE: the API stays up, the receipt
   * list keeps coming and the only change is that all of them show as
   * unavailable. On screen that reads as «the images do not load», which is
   * as far from the cause as one can get.
   *
   * It happened: `SOPORTES_DIR` arrived with the quotes inside the value, so
   * the path stopped being absolute and resolved against the working
   * directory. Diagnosing it took reading the production process's
   * `/proc/<pid>/environ`. This line would have said it at the first restart.
   */
  async onModuleInit(): Promise<void> {
    const { ok: isReady, detail } = await this.store.check().catch((error: unknown) => ({
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }));

    if (isReady) {
      this.logger.log(`Receipt store: ${this.store.describe()} — ${detail}`);
      return;
    }

    this.logger.error(
      `The receipt store is NOT ready (${this.store.describe()}): ${detail}. ` +
        'Every receipt will show as unavailable.',
    );
  }

  /**
   * A transaction's receipts.
   *
   * ── Why `userId` goes in the WHERE and not in an `if` ───────────────────
   * Because an `if` gets forgotten and a `where` does not. Asking for the
   * receipts of someone else's transaction does not return "forbidden": it
   * returns the empty list, because for this query those receipts do not
   * exist. There is no branch of the code where the check can be skipped.
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
      // Promise.all returns one per row: the fallback is never used.
      isAvailable: availability[index] ?? false,
    }));
  }

  /**
   * A receipt's binary, with its row.
   *
   * The THREE conditions go together in the same `where`: the receipt, its
   * transaction and its owner. Asking for someone else's receipt with an id of
   * one's own transaction —or the other way round— finds nothing.
   *
   * ── Why 404 and not 403 ─────────────────────────────────────────────────
   * A 403 confirms the resource exists. With a list of ids and a handful of
   * requests, that difference draws the map of what someone else has in the
   * database. For whoever is not the owner there is nothing here, and that is
   * the answer.
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
      // The row is there and the file is not. It is a possible state —a store
      // half synchronised— and saying so is more useful than a bare 404, which
      // would suggest the receipt never existed.
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
   * Uploads one or several receipts to a transaction.
   *
   * ── The order of the checks matters ─────────────────────────────────────
   * Ownership of the transaction is verified BEFORE touching a single byte.
   * The other way round —optimise and then look whose it is— a stranger could
   * make the server work with ghostscript and sharp by sending files to
   * transactions that are not theirs, which is a cheap way to bring it down.
   *
   * ── Why it is processed before checking for a repeat ────────────────────
   * Because the hash is of the file ALREADY PROCESSED, not of what arrived.
   * Two photos of the same sheet taken a second apart are two different files
   * at the source and the same grey 1100px JPG. Comparing what arrives would
   * let in the very duplicate one wanted to avoid.
   */
  async upload(userId: bigint, transactionId: bigint, files: IncomingFile[]): Promise<Receipt[]> {
    const transaction = await this.repository.findMovementForUpload(userId, transactionId);

    if (!transaction) throw new NotFoundError('El movimiento no existe.');
    validateUploads(files);

    // The name comes from the TRANSACTION, not the file: `IMG_4821.HEIC` does
    // not say which payment it is, and this way uploads match imports.
    const concept =
      transaction.description ?? transaction.merchant ?? transaction.category?.name ?? 'Soporte';
    const date = transaction.date.toISOString().slice(0, 10);

    let position = ((await this.repository.maxOrder(userId, transactionId)) ?? 0) + 1;

    for (const file of files) {
      const { content, mime, extension } = await this.optimizeOrFail(file);
      const hash = hashOf(content);

      // Retrying the same upload does not duplicate: the unique (transaction,
      // hash) would stop it in the database, but failing with a 500 is not an
      // answer; it is simply skipped.
      if (await this.repository.existsWithHash(userId, transactionId, hash)) continue;

      const storageKey = newStorageKey(userId, extension);
      // The file first and the row after: if it is cut in the middle, a binary
      // nobody reaches is left, which is harmless. The other way round would
      // leave a receipt the app promises and cannot show.
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
    Processing the file can fail for TWO reasons, and they are not answered
    the same way.

    ── I cannot open it ──────────────────────────────────────────────────
    The real case is the iPhone's HEIC: it is in `INPUT_TYPES` because it is
    a legitimate image format, but the library that processes images only
    understands it when compiled with support for it —and it almost never
    is, since that ships separately for licensing—. It is final: however
    often it is retried that file will not get in, so what must be said is
    what to come back with.

    ── I CANNOT right now ────────────────────────────────────────────────
    The server ran out of threads or memory to process the image. The file
    is perfect and retrying is exactly the right thing to do.

    They went down the same path, and the result was the worse of both: a
    PNG screenshot got «this server cannot open that format, try again with
    a JPG or a PNG» —advice impossible to follow, since it already was a
    PNG— and the real cause stayed hidden in the parenthesis.

    The status code changes too, and it is no detail: 415 says «do not send
    this», 503 says «send it again». They are opposite instructions.
  */
  private async optimizeOrFail(file: IncomingFile): Promise<OptimizedReceipt> {
    return optimize(file.buffer, file.mimetype).catch((cause: unknown) => {
      const detail = cause instanceof Error ? cause.message : 'error al procesar la imagen';

      if (isOutOfResources(cause)) {
        /*
          What arrived is saved, unprocessed.

          Processing the image is an IMPROVEMENT —grey, 1100px, a third of
          the weight—, not a requirement: the receipt looks the same without
          it. Throwing the receipt away because the server was short of
          threads in that second trades an improvement for a failure.

          And the failure was REAL and frequent: on a shared plan the
          process quota comes and goes, so pasting a screenshot worked or
          not depending on what the neighbour was doing. Asking somebody to
          «wait a few seconds and try again» with the receipt in hand is
          asking them to be a manual retry.

          Only for what the viewer can open. An unprocessed HEIC would be a
          file nobody can look at afterwards: there the problem is the
          format, and giving way fixes nothing.
        */
        const unprocessed = asReceived(file.buffer, file.mimetype);
        if (unprocessed) {
          this.logger.warn(
            `No resources to process an upload (${file.mimetype}): stored as it arrived. (${detail})`,
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
   * Deletes a receipt.
   *
   * Its file is removed after the row (`removeFiles`): a file without a row is
   * an orphan nobody reaches —no route gets to it without its row—, while a
   * row without a file would show up broken.
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
    // The declared type comes from the client; the bytes decide (see MAGIC_BYTES).
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
