import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { readEnv } from '../../common/env';

/**
 * The private store of receipts (on disk).
 *
 * ── Why outside the web tree ────────────────────────────────────────────────
 * Because a receipt carries the holder's name, an account number, sometimes a
 * consumption that tells whether the house was empty in August. Put under
 * `public/`, the server hands it to whoever guesses the URL, and URLs get
 * guessed: file names are predictable and search engines index directories.
 * Here there is no URL to guess —no public path to the file—, only an
 * endpoint that first checks whose it is.
 *
 * ── Why the server writes the key ───────────────────────────────────────────
 * `<userId>/<uuid>.<ext>`. Not one letter comes from the original name. With
 * the user's file name in the path, a file called `../../.env` stops being a
 * prank and becomes an incident; with a uuid, there is nothing to make up
 * from outside. And it is still checked when resolving: defence in two
 * places, because the day somebody puts a key in by hand, `resolve` is all
 * that stands between that and the file system.
 */

/**
 * The only things accepted. An SVG, for instance, is an executable document.
 *
 * @public — nothing imports it: `receipts.contract.spec.ts` reads it as text
 * to check that the contract publishes these same types (a knip exception).
 */
export const ACCEPTED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * The store's folder.
 *
 * In production `RECEIPTS_DIR` sets it and it points OUTSIDE `public_html`.
 * In development it falls back to `api/.soportes`, which is in `.gitignore`:
 * real receipts never get into the repository, not even by accident.
 */
export function storeFolder(): string {
  // `readEnv` and not plain `process.env`: on the server the variable arrives
  // with the quotes inside the value, and a path starting with `"` is not
  // absolute, so `resolve` hung it from the working directory. See
  // `common/env.ts`.
  const declared = readEnv('RECEIPTS_DIR');
  if (declared) return resolve(declared);
  return resolve(__dirname, '..', '..', '..', '.soportes');
}

/**
 * Is it where it says it is?
 *
 * Checked at start-up, and shouted about if not. A mis-pointed store breaks
 * nothing visible: the API stays up, the receipt list keeps coming and the
 * only change is that ALL of them show as unavailable. Without this line,
 * that is diagnosed by reading the production process's `/proc/<pid>/environ`,
 * which is where we ended up the first time.
 */
export function diskStoreStatus(): { folder: string; exists: boolean } {
  const folder = storeFolder();
  return { folder, exists: existsSync(folder) };
}

/**
 * The absolute path of a key, checking it does not leave the store.
 *
 * Returns `null` instead of throwing when the key points outside: to the
 * caller, a file that does not exist and a file it may not touch have to
 * look the same.
 */
export function diskPathOf(storageKey: string): string | null {
  const base = storeFolder();
  const target = resolve(base, storageKey);

  // `resolve` already collapsed the `..`, so this sees the real result. The
  // separator at the end of the prefix matters: without it, `/soportes-otro`
  // would pass for being inside `/soportes`.
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

/** sha256 of the content: the same file twice is the same receipt. */
export function hashOf(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** The key a new file gets. The server writes all of it. */
export function newStorageKey(userId: bigint, extension: string): string {
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${userId.toString()}/${randomUUID()}.${ext}`;
}

/** Saves the binary. Overwrites nothing: the key carries a fresh uuid. */
export async function saveToDisk(storageKey: string, content: Buffer): Promise<void> {
  const target = diskPathOf(storageKey);
  if (target === null) throw new Error(`Clave de almacenamiento inválida: ${storageKey}`);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { flag: 'wx' });
}

/** Whether the binary is on disk. The row can exist without it —and the other way round—. */
export function exists(storageKey: string): boolean {
  const target = diskPathOf(storageKey);
  return target !== null && existsSync(target);
}

/** The binary, as a stream. It is not loaded whole into memory to serve it. */
export function openFromDisk(storageKey: string): ReturnType<typeof createReadStream> | null {
  const target = diskPathOf(storageKey);
  if (target === null || !existsSync(target)) return null;
  return createReadStream(target);
}
