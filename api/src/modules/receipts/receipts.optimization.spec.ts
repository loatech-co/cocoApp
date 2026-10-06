import {
  ghostscriptArgs,
  matchesDeclaredType,
  asReceived,
  run,
  isOutOfResources,
} from './receipts.optimization';

/**
 * What whoever uploads a receipt that could not be processed is told.
 *
 * They are two OPPOSITE answers and this function decides them: «send
 * something else» when the format cannot be opened, and «send the same again»
 * when the server ran out of threads. Getting it wrong sends somebody to
 * convert a file that was already fine, or to retry forever one that will
 * never get in.
 */
describe('Lack of resources versus a format that is not understood', () => {
  it('recognises the thread that could not be created', () => {
    // The real case, as libvips reports it on the shared hosting: the account
    // has a process quota, libvips asks for its thread pool and
    // `pthread_create` returns EAGAIN.
    expect(
      isOutOfResources(new Error('glib: Error creating thread: Resource temporarily unavailable')),
    ).toBe(true);
  });

  it('recognises running out of memory and descriptors', () => {
    for (const message of [
      'Cannot allocate memory',
      'vips__init: out of memory',
      'spawn ENOMEM',
      'EMFILE: too many open files',
      'gs salió con 1: fork: Resource temporarily unavailable',
    ]) {
      expect(isOutOfResources(new Error(message))).toBe(true);
    }
  });

  it('does NOT mistake a format the library cannot open', () => {
    // The iPhone's HEIC: libvips only understands it when compiled with
    // support for it, and it almost never is. Retrying changes nothing, so this
    // must keep answering 415 and not 503.
    for (const message of [
      'Input buffer contains unsupported image format',
      'heifload: unsupported compression',
      'VipsForeignLoad: buffer is not in a known format',
    ]) {
      expect(isOutOfResources(new Error(message))).toBe(false);
    }
  });

  it('copes with what is not an Error', () => {
    // A native library may reject with a bare string, and the path that reads
    // `cause.message` would crash right inside the error handler.
    expect(isOutOfResources('Resource temporarily unavailable')).toBe(true);
    expect(isOutOfResources(undefined)).toBe(false);
    expect(isOutOfResources(null)).toBe(false);
  });
});

/**
 * What is saved when the image could not be processed for lack of resources.
 *
 * Processing is an improvement, not a requirement: the receipt looks the same
 * without it. Losing the receipt because the server was short of threads in
 * that second would trade an improvement for a failure.
 */
describe('Saving the file as it arrived', () => {
  it('accepts what the viewer can open, with its true extension', () => {
    const bytes = Buffer.from([1, 2, 3]);

    // The extension tells the truth: a PNG saved as `.jpg` is a file that lies
    // about itself.
    expect(asReceived(bytes, 'image/png')).toEqual({
      content: bytes,
      mime: 'image/png',
      extension: 'png',
    });
    expect(asReceived(bytes, 'image/jpeg')?.extension).toBe('jpg');
    expect(asReceived(bytes, 'application/pdf')?.extension).toBe('pdf');
  });

  it('refuses what could not be looked at afterwards', () => {
    // An unprocessed HEIC is a file the viewer cannot open: there the problem
    // is the format, and saving it anyway only postpones the failure.
    expect(asReceived(Buffer.alloc(0), 'image/heic')).toBeNull();
    expect(asReceived(Buffer.alloc(0), 'image/webp')).toBeNull();
  });
});

describe('What is uploaded is what it says it is', () => {
  const PDF = Buffer.from('%PDF-1.7\n', 'latin1');
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const POSTSCRIPT = Buffer.from('%!PS-Adobe-3.0\n', 'latin1');

  it('accepts each type with its signature', () => {
    expect(matchesDeclaredType(PDF, 'application/pdf')).toBe(true);
    expect(matchesDeclaredType(JPEG, 'image/jpeg')).toBe(true);
    expect(matchesDeclaredType(PNG, 'image/png')).toBe(true);
    expect(matchesDeclaredType(Buffer.from('....ftypheic', 'latin1'), 'image/heic')).toBe(true);
    expect(matchesDeclaredType(Buffer.from('RIFF....WEBPVP8 ', 'latin1'), 'image/webp')).toBe(true);
  });

  it('rejects what does not match the declared type', () => {
    // A PostScript labelled as PDF would go straight to the interpreter.
    expect(matchesDeclaredType(POSTSCRIPT, 'application/pdf')).toBe(false);
    expect(matchesDeclaredType(PNG, 'image/jpeg')).toBe(false);
    expect(matchesDeclaredType(JPEG, 'application/pdf')).toBe(false);
    expect(matchesDeclaredType(Buffer.alloc(0), 'image/png')).toBe(false);
    expect(matchesDeclaredType(PDF, 'text/plain')).toBe(false);
  });
});

describe('Ghostscript with protections', () => {
  it('runs in safe mode', () => {
    expect(ghostscriptArgs('/tmp/a.pdf', '/tmp/b.pdf')[0]).toBe('-dSAFER');
  });

  it('kills the process that goes past the time limit', async () => {
    const start = Date.now();
    await expect(run('sleep', ['5'], 100)).rejects.toThrow(/tardó más de/);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
