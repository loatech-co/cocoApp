// @ts-check
import { userInfo } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where the journeys run. One place, read by the launcher and by the config.
 *
 * Everything is local and throwaway: a Postgres database whose name ends in
 * `_test`, the fake GoTrue on 127.0.0.1, and the API serving the built SPA.
 */

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Test documents: a receipt PDF with embedded text, so no OCR is needed. */
export const FILES = resolve(ROOT, 'e2e', 'archivos');

export const API_PORT = Number(process.env.E2E_API_PORT ?? 4310);
export const GOTRUE_PORT = Number(process.env.E2E_GOTRUE_PORT ?? 4311);
export const BASE_URL = `http://localhost:${API_PORT}`;

/** The journeys' own database. Its own name, so parallel worktrees do not collide. */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  `postgresql://${userInfo().username}@localhost:5432/coco_e2e_pw_test`;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * The firewall. The launcher empties every table of this database, so it
 * refuses anything that is not a local database named `*_test`.
 *
 * @param {string} url
 * @returns {string} the database name
 */
export function requireTestDatabase(url) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`The journeys empty their database, and "${name}" does not end in _test.`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`The journeys only run against a local Postgres, not "${parsed.hostname}".`);
  }
  return name;
}
