#!/usr/bin/env node
//
// The local auth server for development: `npm run dev:auth`.
//
// ── Why ──────────────────────────────────────────────────────────────────────
// There is no Supabase project for development, only production's. A `.env`
// pointed at it signs up, deletes and signs out REAL accounts from a laptop
// (`whyNotTouchRealAccounts`, api/src/common/env.ts). So locally the API talks
// to this instead: the same fake GoTrue the Playwright journeys use, listening
// on 127.0.0.1 only, with its key and accounts kept in `api/.dev-auth.json`
// (ignored by git) so they survive a restart.
//
// Point `SUPABASE_URL` in `api/.env` at the URL it prints. The anon and
// service keys can be any non-empty text: this server does not check them.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startFakeGoTrue } from '../e2e/support/fake-gotrue.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.DEV_AUTH_PORT ?? 9999);
const stateFile = resolve(ROOT, 'api', '.dev-auth.json');

const server = await startFakeGoTrue({ port, stateFile });
console.log(`[dev-auth] local auth server on ${server.url} (state in api/.dev-auth.json)`);

const stop = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
