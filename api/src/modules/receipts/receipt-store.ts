import { unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { openFromDisk, diskStoreStatus, exists, saveToDisk, diskPathOf } from './receipts.storage';
import { readEnv } from '../../common/env';

/**
 * Where receipt files live (phase 6.9).
 *
 * The service only knows this interface. Two implementations:
 *   - `SupabaseReceiptStore`: a PRIVATE Supabase Storage bucket, reached only
 *     by the API with the service-role key. Production.
 *   - `DiskReceiptStore`: the folder in RECEIPTS_DIR, as before. Local work
 *     and tests, and the production fallback of last resort.
 *
 * The key (`<userId>/<uuid>.<ext>`, from `claveNueva`) and the sha256 in
 * `soportes.huella` are the same in both, so a file copied from one to the
 * other is checked by hash, and moving back is a configuration change.
 */
export interface ReceiptStore {
  /** Where it stores, for the start-up log line. Never a secret. */
  describe(): string;
  /** Whether the store is reachable/configured; logged at start-up. */
  check(): Promise<{ ok: boolean; detail: string }>;
  save(key: string, content: Buffer, mimeType: string): Promise<void>;
  /** The file, or null if the store does not have it. */
  open(key: string): Promise<Readable | null>;
  exists(key: string): Promise<boolean>;
  /** Removes files; missing ones are not an error. */
  remove(keys: string[]): Promise<void>;
}

export const RECEIPT_STORE = Symbol('RECEIPT_STORE');

/** `RECEIPTS_STORAGE` if set; otherwise Supabase in production and disk elsewhere. */
export function chosenStore(env: NodeJS.ProcessEnv): 'supabase' | 'disk' {
  const declared = readEnv('RECEIPTS_STORAGE');
  if (declared === 'supabase' || declared === 'disk') return declared;
  return env.NODE_ENV === 'production' ? 'supabase' : 'disk';
}

export function createReceiptStore(env: NodeJS.ProcessEnv = process.env): ReceiptStore {
  if (chosenStore(env) === 'disk') return new DiskReceiptStore();

  const url = readEnv('SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('RECEIPTS_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return new SupabaseReceiptStore(url, key, readEnv('RECEIPTS_BUCKET') ?? 'soportes');
}

class DiskReceiptStore implements ReceiptStore {
  describe(): string {
    return `disk ${diskStoreStatus().folder}`;
  }

  check(): Promise<{ ok: boolean; detail: string }> {
    const { folder, exists: doesExist } = diskStoreStatus();
    return Promise.resolve({
      ok: doesExist,
      detail: doesExist
        ? folder
        : `${folder} does not exist — check RECEIPTS_DIR (mind the quotes)`,
    });
  }

  save(key: string, content: Buffer): Promise<void> {
    return saveToDisk(key, content);
  }

  open(key: string): Promise<Readable | null> {
    return Promise.resolve(openFromDisk(key));
  }

  exists(key: string): Promise<boolean> {
    return Promise.resolve(exists(key));
  }

  async remove(keys: string[]): Promise<void> {
    // In production the disk is the BACKUP left behind by the move to Storage
    // (phase 6.9), and nothing on the server is deleted until phase 7.
    if (process.env.NODE_ENV === 'production') return;

    for (const key of keys) {
      const path = diskPathOf(key);
      if (path) await unlink(path).catch(() => undefined);
    }
  }
}

/**
 * Supabase Storage over its REST API, with `fetch`: no SDK, no new
 * dependency. The bucket is private; every call carries the service-role key
 * and never leaves the server, so the only way to a receipt is through the
 * API's own per-user checks.
 */
export class SupabaseReceiptStore implements ReceiptStore {
  private readonly base: string;

  constructor(
    url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {
    this.base = `${url.replace(/\/$/, '')}/storage/v1`;
  }

  describe(): string {
    return `supabase bucket "${this.bucket}" at ${new URL(this.base).host}`;
  }

  async check(): Promise<{ ok: boolean; detail: string }> {
    const response = await this.request('GET', `/bucket/${this.bucket}`);
    if (!response.ok)
      return { ok: false, detail: `bucket "${this.bucket}": HTTP ${response.status}` };
    const bucket = (await response.json()) as { public?: boolean };
    return bucket.public
      ? { ok: false, detail: `bucket "${this.bucket}" is PUBLIC; receipts must be private` }
      : { ok: true, detail: `bucket "${this.bucket}" (private)` };
  }

  async save(key: string, content: Buffer, mimeType: string): Promise<void> {
    const response = await this.request('POST', this.objectPath(key), content, {
      'content-type': mimeType,
      'x-upsert': 'false',
    });
    if (!response.ok) {
      throw new Error(`Storage refused ${key}: HTTP ${response.status} ${await response.text()}`);
    }
  }

  async open(key: string): Promise<Readable | null> {
    const response = await this.request('GET', this.objectPath(key));
    if (!response.ok || !response.body) return null;
    return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  }

  async exists(key: string): Promise<boolean> {
    const response = await this.request('HEAD', this.objectPath(key));
    return response.ok;
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const response = await this.request(
      'DELETE',
      `/object/${this.bucket}`,
      JSON.stringify({ prefixes: keys }),
      {
        'content-type': 'application/json',
      },
    );
    if (!response.ok) throw new Error(`Storage could not delete: HTTP ${response.status}`);
  }

  private objectPath(key: string): string {
    // Keys are `<digits>/<uuid>.<ext>`; encoding each segment keeps the slash.
    return `/object/${this.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private request(
    method: string,
    path: string,
    body?: Buffer | string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      method,
      // A Buffer is a Uint8Array; fetch's types want the plain view.
      ...(body !== undefined && { body: typeof body === 'string' ? body : new Uint8Array(body) }),
      headers: { authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...headers },
      signal: AbortSignal.timeout(30_000),
    });
  }
}
