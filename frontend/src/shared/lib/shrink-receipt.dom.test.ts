// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shrinkReceipt, shrinkReceipts } from './shrink-receipt';

/**
 * What gets uploaded is a light JPG, and if that is not possible, whatever
 * was there gets uploaded.
 *
 * The second half matters as much as the first: shrinking is an improvement,
 * not a requirement. A browser that cannot open the format must not be left
 * unable to attach the receipt.
 */
function file(name: string, type: string, kb: number): File {
  return new File([new Uint8Array(kb * 1024)], name, { type });
}

/** jsdom does not draw: the canvas and the decoding are faked. */
function fakeBrowser({
  width: width = 4032,
  height: height = 3024,
  outputBytes: outputBytes = 120 * 1024,
  canDecode: canDecode = true,
  canPaint: canPaint = true,
}: {
  width?: number;
  height?: number;
  outputBytes?: number | null;
  canDecode?: boolean;
  canPaint?: boolean;
} = {}): { canvas: () => { width: number; height: number } } {
  const size = { width: 0, height: 0 };

  vi.stubGlobal(
    'createImageBitmap',
    // Explicit promises instead of `async`: what matters about this double is
    // that it REJECTS when the format is not understood, and `async` managed
    // it by accident. Said this way, what it does can be read.
    vi.fn(() =>
      canDecode
        ? Promise.resolve({ width, height } as unknown as ImageBitmap)
        : Promise.reject(new Error('formato desconocido')),
    ),
  );

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') {
      return Object.getPrototypeOf(document).createElement.call(document, tag);
    }
    return {
      set width(v: number) {
        size.width = v;
      },
      get width() {
        return size.width;
      },
      set height(v: number) {
        size.height = v;
      },
      get height() {
        return size.height;
      },
      getContext: () => (canPaint ? { drawImage: vi.fn() } : null),
      toBlob: (cb: (b: Blob | null) => void) =>
        cb(
          outputBytes === null
            ? null
            : new Blob([new Uint8Array(outputBytes)], { type: 'image/jpeg' }),
        ),
    } as unknown as HTMLCanvasElement;
  });

  return { canvas: () => size };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Shrinking a receipt before uploading it', () => {
  it("converts a phone's photo to JPG and shrinks it", async () => {
    const { canvas } = fakeBrowser({ width: 4032, height: 3024 });

    const outputBytes = await shrinkReceipt(file('IMG_4821.jpg', 'image/jpeg', 4096));

    expect(outputBytes.type).toBe('image/jpeg');
    expect(outputBytes.size).toBeLessThan(4096 * 1024);
    // The long side ends at 1600: above the 1100 the server reduces to, so the
    // final cut is the server's call.
    expect(canvas()).toEqual({ width: 1600, height: 1200 });
  });

  it('a HEIC is ALWAYS converted, even when small', async () => {
    // Its problem is not the weight: the server cannot open that format, and
    // that is why it answered «Ocurrió un error inesperado».
    fakeBrowser({ width: 800, height: 600, outputBytes: 90 * 1024 });

    const outputBytes = await shrinkReceipt(file('IMG_4821.HEIC', 'image/heic', 300));

    expect(outputBytes.type).toBe('image/jpeg');
    expect(outputBytes.name).toBe('IMG_4821.jpg');
  });

  it('a small AND narrow image is left alone: re-encoding it takes sharpness away', async () => {
    // Both conditions. Low weight alone is not enough: see the test below,
    // which is the case that slipped through to the server.
    fakeBrowser({ width: 900, height: 700 });
    const original = file('recorte.png', 'image/png', 200);

    expect(await shrinkReceipt(original)).toBe(original);
  });

  it('a LIGHT but huge screenshot does get shrunk', async () => {
    /*
      The real case: pasting a screenshot.

      It weighs 300 KB —below the threshold— and is 2560 wide. With the
      weight-only filter, it traveled whole and the server had to decode those
      2560px; with the counted threads of a shared plan, that is where it blew
      up with «glib: Error creating thread».

      That is why PASTING failed and uploading a photo did not: the photo
      weighs more, and for weighing more it did get shrunk here.
    */
    const { canvas } = fakeBrowser({ width: 2560, height: 1440, outputBytes: 150 * 1024 });

    const outputBytes = await shrinkReceipt(file('captura.png', 'image/png', 300));

    expect(outputBytes.type).toBe('image/jpeg');
    expect(canvas()).toEqual({ width: 1600, height: 900 });
  });

  it('a PDF is not touched: it has pages, and flattening it would lose all but one', async () => {
    fakeBrowser();
    const original = file('recibo.pdf', 'application/pdf', 4096);

    expect(await shrinkReceipt(original)).toBe(original);
  });

  it('if the browser cannot open the format, the original is uploaded', async () => {
    // Shrinking is an improvement, not a requirement: turning it into a step
    // that can prevent the upload would be trading one failure for another.
    fakeBrowser({ canDecode: false });
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | null = null;
        set src(_: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      },
    );

    const original = file('raro.jxl', 'image/jxl', 4096);
    expect(await shrinkReceipt(original)).toBe(original);
  });

  it('if the canvas cannot be read, the original is uploaded', async () => {
    fakeBrowser({ canPaint: false });
    const original = file('foto.jpg', 'image/jpeg', 4096);

    expect(await shrinkReceipt(original)).toBe(original);
  });

  it('a batch is shrunk whole', async () => {
    fakeBrowser();
    const outputs = await shrinkReceipts([
      file('a.jpg', 'image/jpeg', 4096),
      file('b.pdf', 'application/pdf', 4096),
    ]);

    expect(outputs[0]!.type).toBe('image/jpeg');
    expect(outputs[0]!.size).toBeLessThan(4096 * 1024);
    expect(outputs[1]!.type).toBe('application/pdf');
  });
});
