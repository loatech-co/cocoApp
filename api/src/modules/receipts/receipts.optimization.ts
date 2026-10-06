import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { readEnv } from '../../common/env';

/**
 * What a receipt goes through before it is saved.
 *
 * ── Why the file is touched ─────────────────────────────────────────────────
 * A receipt is a scanned sheet or a phone photo: it arrives in colour, four
 * thousand pixels wide and weighing three megabytes, and none of that is
 * needed. What anyone looks up in a receipt is the value, the date and the
 * letterhead, and those read the same in grey at 120 dpi. The difference is a
 * hundred to one on disk and in how long it takes to open.
 *
 * ── Why grey and not just compression ───────────────────────────────────────
 * Because almost every receipt IS grey —black ink on paper— and the colour it
 * carries is scanner noise: a faintly blue background, a stamp that adds
 * nothing. Removing it weighs less and also gives the whole batch the same
 * look, which is what makes a row of eight thumbnails read as a set and not
 * as eight loose photos.
 *
 * ── These parameters and no others ──────────────────────────────────────────
 * They are the ones of the batch already loaded. They were not chosen here:
 * they are copied so a receipt uploaded from the app is indistinguishable
 * from the 443 that came in through the importer. If they ever change, they
 * change in both places at once, which is exactly why this module exists.
 */

/*
  ── libvips works with ONE thread, and it is not an optimisation ─────────────
  It is what makes it work on the server where this lives.

  `sharp` wraps libvips, which by default opens a thread pool as large as the
  number of cores it sees. On SHARED hosting that is a trap: the machine
  reports sixteen cores because it has them, but the account has a process
  and thread quota far below that, shared with everything else running.
  libvips asks for its pool, `pthread_create` returns EAGAIN and the error
  that comes out at the bottom is

      glib: Error creating thread: Resource temporarily unavailable

  which is also INTERMITTENT —it depends on how much the neighbour is using in
  that second—, so the same capture fails once and goes through the next
  time. It is the same quota that had already bitten us in deployments.

  With concurrency at 1, libvips does the work on the thread it already has
  and asks for none. A large image loses speed and nothing else is lost:
  this processes ONE receipt 1100px wide, not a batch.

  It stays configurable because on a machine of our own —a container with its
  cores— raising it does pay off. The default is the one that holds where it
  is really deployed.

  `cache(false)` is for the same reason: libvips's cache reserves memory and
  opens descriptors to reuse operations between calls, and there is nothing
  to reuse here —each receipt is processed once and never comes back—.
*/
sharp.concurrency(Number(process.env.SHARP_CONCURRENCY) || 1);
sharp.cache(false);

/** Maximum width of an image. A wider receipt does not read any better. */
const MAX_WIDTH = 1100;
/** JPEG quality. Below 50 the value starts to be hard to read. */
const JPEG_QUALITY = 55;
/** Resolution of the images inside a PDF. */
const PPP = 120;

/** What may be uploaded, by declared type. */
export const INPUT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

/**
 * The signature each input type starts with.
 *
 * The client writes the `mimetype`: anything labelled `application/pdf` could
 * be sent and would reach ghostscript as is, and ghostscript is a PostScript
 * interpreter. What gets processed is what the FIRST bytes say it is, and it
 * has to match what was declared.
 *
 * HEIC/HEIF are ISO BMFF containers (`ftyp` at byte 4); WEBP is RIFF with
 * `WEBP` at byte 8.
 */
const MAGIC_BYTES: Record<string, readonly { offset: number; bytes: Buffer }[]> = {
  'application/pdf': [{ offset: 0, bytes: Buffer.from('%PDF-', 'latin1') }],
  'image/jpeg': [{ offset: 0, bytes: Buffer.from([0xff, 0xd8, 0xff]) }],
  'image/png': [
    { offset: 0, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  ],
  'image/heic': [{ offset: 4, bytes: Buffer.from('ftyp', 'latin1') }],
  'image/heif': [{ offset: 4, bytes: Buffer.from('ftyp', 'latin1') }],
  'image/webp': [
    { offset: 0, bytes: Buffer.from('RIFF', 'latin1') },
    { offset: 8, bytes: Buffer.from('WEBP', 'latin1') },
  ],
};

/** Are the file's bytes really of the declared type? */
export function matchesDeclaredType(content: Buffer, mime: string): boolean {
  const signatures = MAGIC_BYTES[mime];
  if (!signatures) return false;
  return signatures.every(({ offset, bytes }) =>
    content.subarray(offset, offset + bytes.length).equals(bytes),
  );
}

/**
 * The longest ghostscript may take with a PDF. A legitimate receipt PDF takes
 * seconds; one crafted to hang it keeps a process out of a quota that is tiny
 * on the hosting. Past the limit, it is killed.
 */
const GHOSTSCRIPT_TIMEOUT_MS = 20_000;

/** Input limit. Whatever comes out of here weighs a fraction. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface OptimizedReceipt {
  content: Buffer;
  mime: string;
  /** Without the dot: `pdf` or `jpg`. */
  extension: 'pdf' | 'jpg' | 'png';
}

/**
 * The ghostscript binary.
 *
 * Configurable because it is not in the same place everywhere —on the server
 * it is `/usr/bin/gs`, on a Mac with Homebrew it hangs from `/opt/homebrew`—
 * and because if it is ever missing, it is worth being able to point at
 * another one without touching code.
 */
function ghostscriptBinary(): string {
  // With quotes inside the value —which is how it arrives on the server—
  // `spawn` looks for an executable called `"/usr/bin/gs"` and no PDF is optimised.
  return readEnv('GHOSTSCRIPT_BIN') ?? 'gs';
}

/**
 * Gets a receipt ready to be saved: grey and light.
 *
 * A PDF stays a PDF —it has pages, and flattening it to an image would lose
 * all but the first— and any image comes out as JPG, whatever it came as:
 * png, webp or an iPhone's HEIC photo.
 */
export async function optimize(content: Buffer, mime: string): Promise<OptimizedReceipt> {
  if (mime === 'application/pdf') {
    return { content: await optimizePdf(content), mime: 'application/pdf', extension: 'pdf' };
  }

  return { content: await optimizeImage(content), mime: 'image/jpeg', extension: 'jpg' };
}

/**
 * Image → grey JPG, at most 1100px wide.
 *
 * `withoutEnlargement` so a small screenshot is not blown up to 1100:
 * enlarging it adds no detail and does add weight.
 *
 * And the METADATA is dropped by not asking for it: a photo of a receipt
 * carries the phone model and, if GPS was on, the coordinates where it was
 * taken. That is not part of the receipt.
 */
async function optimizeImage(content: Buffer): Promise<Buffer> {
  return (
    sharp(content, { failOn: 'none' })
      .rotate() // Honours the EXIF before dropping it: otherwise the photo comes out sideways.
      .grayscale()
      /*
        `toColourspace('b-w')` on top of `grayscale()`, and it is not redundant.

        `grayscale()` makes the image grey but the JPEG still comes out with
        its three channels —all three with the same value— and weighs a third
        more to say nothing new. This writes it with ONE channel, which is
        what `-colorspace Gray` does in ImageMagick, used for the batch.
      */
      .toColourspace('b-w')
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer()
  );
}

/**
 * PDF → grey PDF, compressed and resampled to 120 dpi.
 *
 * ── Why ghostscript and not a Node library ──────────────────────────────────
 * Because the job is not rewriting the PDF but REPROCESSING what is inside:
 * turning each embedded image grey and lowering its resolution. Node
 * libraries can handle a PDF's structure —pages, fields, signatures— but do
 * not re-encode its images, which is where all the weight of a scan is.
 *
 * ── Why files and not pipes ─────────────────────────────────────────────────
 * Ghostscript reads standard input with `-`, but writing to standard output
 * needs `-sOutputFile=-`, and then it mixes the PDF with its own warnings in
 * the same stream. A temporary file costs two writes and has no way to come
 * out corrupt.
 */
async function optimizePdf(content: Buffer): Promise<Buffer> {
  const folder = await mkdtemp(join(tmpdir(), 'coco-soporte-'));
  const input = join(folder, `${randomUUID()}.pdf`);
  const output = join(folder, `${randomUUID()}.pdf`);

  try {
    await writeFile(input, content);

    await run(ghostscriptBinary(), ghostscriptArgs(input, output));

    const result = await readFile(output);

    /*
      If processing does not slim it down, the original stays.

      It happens with PDFs that arrive already optimised —the batch's, to
      begin with— where reprocessing adds ghostscript's structure without
      removing anything. Keeping the larger result would be paying for the
      work of making it worse.
    */
    return result.length > 0 && result.length < content.length ? result : content;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/**
 * The ghostscript arguments. `-dSAFER` goes first and is the protection:
 * without it, a PDF can ask the interpreter to read or write the server's
 * files and to run commands. Recent versions have it by default; it is
 * written anyway so as not to depend on the installed one.
 */
export function ghostscriptArgs(input: string, output: string): string[] {
  return [
    '-dSAFER',
    '-o',
    output,
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=Gray',
    '-sProcessColorModel=DeviceGray',
    '-dCompatibilityLevel=1.4',
    '-dPDFSETTINGS=/ebook',
    '-dDownsampleColorImages=true',
    `-dColorImageResolution=${PPP}`,
    '-dDownsampleGrayImages=true',
    `-dGrayImageResolution=${PPP}`,
    '-dNOPAUSE',
    '-dBATCH',
    '-dQUIET',
    input,
  ];
}

/** Runs a process and fails with its error output, which is what explains it. */
export function run(
  binary: string,
  args: string[],
  timeoutMs = GHOSTSCRIPT_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    let isTimedOut = false;

    // SIGKILL and not SIGTERM: a stuck interpreter may ignore the request to
    // finish, and what is wanted is to get the process back.
    const timer = setTimeout(() => {
      isTimedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stderr.on('data', (chunk: Buffer) => {
      error += chunk.toString();
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(
        new Error(
          `No se pudo ejecutar ${binary}: ${e.message}. ` +
            'Define GHOSTSCRIPT_BIN si está en otra ruta.',
        ),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (isTimedOut) {
        reject(new Error(`${binary} tardó más de ${Math.round(timeoutMs / 1000)} s y se detuvo.`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${binary} salió con ${code}: ${error}`));
      }
    });
  });
}

/**
 * What arrived, unprocessed, if it is something the app knows how to show.
 *
 * ── When it is for ─────────────────────────────────────────────────────────
 * For when processing the image fails for lack of resources. Processing is an
 * IMPROVEMENT —grey, 1100px, a third of the weight—, not a requirement: the
 * receipt looks the same without it. Losing the receipt because the server
 * was short of threads in that second trades an improvement for a failure,
 * which is exactly what it did: «could not process», and the file in the bin.
 *
 * It is the same treatment the browser already gives, where shrinking before
 * upload also falls back to the original when it cannot.
 *
 * ── Why only these three ───────────────────────────────────────────────────
 * Because they are the ones the app's viewer can open. Saving an
 * unprocessed HEIC would save a file nobody can look at afterwards: there the
 * problem is the format, and giving way fixes nothing.
 */
export function asReceived(content: Buffer, mime: string): OptimizedReceipt | null {
  // The extension tells the TRUTH about what is saved. A PNG named `.jpg` is a
  // file that lies about itself, and the day somebody reads the store from
  // outside the app —a backup, a script— they find that half the `.jpg` are not.
  if (mime === 'application/pdf') return { content, mime, extension: 'pdf' };
  if (mime === 'image/jpeg') return { content, mime, extension: 'jpg' };
  if (mime === 'image/png') return { content, mime, extension: 'png' };
  return null;
}

/**
 * Did this fail for lack of server RESOURCES, and not because of the file?
 *
 * ── Why it must be told apart ───────────────────────────────────────────────
 * Because the two are answered in opposite ways. A format the library cannot
 * open —an iPhone's HEIC— is final: however often it is retried, that file
 * will not get in, and what has to be said is «send a JPG». A thread that
 * could not be created is passing: the file is perfect and the only thing to
 * do is wait a moment.
 *
 * They were mixed, and the result was the worse of both: a PNG screenshot got
 * «this server cannot open that format, try again with a JPG or a PNG» —a
 * piece of advice impossible to follow, since it already was a PNG— and the
 * real problem stayed hidden in the closing parenthesis.
 *
 * ── What is looked at ───────────────────────────────────────────────────────
 * The text, because it is all there is: libvips and ghostscript return no
 * code, they return the string the operating system gave them. They are the
 * classic exhaustion errors —cannot create a thread, cannot reserve memory,
 * no descriptors left— and no library invents their names: `errno` does.
 */
export function isOutOfResources(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);

  return /resource temporarily unavailable|error creating thread|cannot allocate memory|out of memory|enomem|eagain|too many open files|emfile|enfile|cannot fork|resource deadlock/i.test(
    message,
  );
}

/**
 * The name a receipt is saved under: `<Concept> - <Payment date>`.
 *
 * ── Why NOT the name the file came with ─────────────────────────────────────
 * Because the name it brings is `IMG_4821.HEIC` or `scan0007.pdf`, which does
 * not say which payment it is. The transaction's does, and it also makes what
 * is uploaded from the app match the 443 of the batch, named that way.
 *
 * ── Why without the "i of N" ────────────────────────────────────────────────
 * Because the total changes as soon as one is added. Baked into the name, a
 * transaction's fourth receipt would force renaming the three earlier ones
 * that said "1 of 3". The order lives in its column and the "i of N" is
 * computed when it is looked at.
 */
export function receiptFileName(concept: string, isoDate: string, extension: string): string {
  return `${sanitized(concept)} - ${isoDate}.${extension}`;
}

/**
 * A name the file system and a download accept.
 *
 * The slash is the real case: "PILA / Seguridad Social" does not fit in a file
 * name and the batch saved it as "PILA - Seguridad Social".
 */
function sanitized(text: string): string {
  return (
    text
      .replace(/[/\\]/g, '-')
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"|?* -]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'Soporte'
  );
}
