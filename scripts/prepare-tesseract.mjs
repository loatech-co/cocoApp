#!/usr/bin/env node
/**
 * Leaves the Tesseract resources served from our own origin.
 *
 * ── The problem it solves ────────────────────────────────────────────────────
 * By default, `tesseract.js` downloads its worker, its WASM engine and the
 * language data from `cdn.jsdelivr.net` AT RUN TIME. For a finance app that has
 * three drawbacks, in order of severity:
 *
 *   1. A WASM binary fetched from a third party would run in the user's
 *      browser, without going through the lockfile or any check of ours.
 *   2. Importing a statement would stop working if that CDN fails.
 *   3. A strict CSP on the deployed site would block it.
 *
 * What this script does: it copies the worker and the engine FROM
 * node_modules —where they already arrived verified by package-lock.json— and
 * downloads the Spanish language data from Tesseract's official repository,
 * once, at build time. At run time nothing goes anywhere.
 *
 * It runs as the root `postinstall`, so on the server too, on every deploy.
 *
 * The output goes to `frontend/public/tesseract/`, which is in .gitignore:
 * they are reproducible artifacts, not source.
 */
import { createWriteStream } from 'node:fs';
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'frontend', 'public', 'tesseract');

/**
 * Language data, from Tesseract's official repository.
 *
 * `tessdata_fast` and not `tessdata_best`: it is four times smaller and quite a
 * bit faster, and on the printed, regular text of a bank statement the
 * difference in accuracy is marginal. It would not do for handwriting, but
 * there is none here.
 */
const LANGUAGE = 'spa';
const LANGUAGE_URL = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${LANGUAGE}.traineddata`;

/**
 * Engine variants to copy. THREE, not the twenty-four the package ships
 * (50 MB).
 *
 * `worker.min.js` itself was read to learn which ones it really asks for: it
 * picks among `relaxedsimd`, `simd` and the basic one depending on what the
 * browser supports, and adds the `-lstm` suffix when the language data is
 * LSTM-only — which is exactly the case of `tessdata_fast`, the one
 * downloaded below.
 *
 * They are 11 MB on disk, of which each browser downloads ONE (3.7 MB). If it
 * ever moved to `tessdata_best`, which includes the legacy engine, the
 * variants without `-lstm` would have to be added here or they would 404.
 */
const ENGINE_VARIANTS = [
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-lstm.wasm.js',
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(join(TARGET, 'core'), { recursive: true });
  await mkdir(join(TARGET, 'lang'), { recursive: true });

  // The worker and the engine come from node_modules: the lockfile already
  // verified them.
  await cp(
    join(ROOT, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    join(TARGET, 'worker.min.js'),
  );

  for (const variant of ENGINE_VARIANTS) {
    await cp(join(ROOT, 'node_modules', 'tesseract.js-core', variant), join(TARGET, 'core', variant));
  }
  console.log(`✓ worker and ${ENGINE_VARIANTS.length} engine variants, from node_modules`);

  // The language data comes in no package: it has to be fetched.
  const languageTarget = join(TARGET, 'lang', `${LANGUAGE}.traineddata`);
  if (await exists(languageTarget)) {
    console.log(`✓ ${LANGUAGE}.traineddata was already there`);
    return;
  }

  console.log(`Downloading ${LANGUAGE}.traineddata…`);
  const response = await fetch(LANGUAGE_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download the language data: HTTP ${response.status}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(languageTarget));

  const { size } = await stat(languageTarget);
  console.log(`✓ ${LANGUAGE}.traineddata (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((error) => {
  console.error('Preparing Tesseract failed:', error.message);
  console.error('Without it, image recognition will not work.');
  process.exit(1);
});
