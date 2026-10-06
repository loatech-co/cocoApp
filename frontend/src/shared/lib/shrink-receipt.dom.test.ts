// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shrinkReceipt, shrinkReceipts } from './shrink-receipt';

/**
 * Lo que se sube es un JPG liviano, y si no se puede, se sube lo que había.
 *
 * La segunda mitad importa tanto como la primera: encoger es una mejora, no un
 * requisito. Un navegador que no sepa abrir el formato no puede quedarse sin
 * poder adjuntar el recibo.
 */
function file(name: string, type: string, kb: number): File {
  return new File([new Uint8Array(kb * 1024)], name, { type });
}

/** jsdom no dibuja: se finge el lienzo y la decodificación. */
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
    // Promesas explícitas en vez de `async`: lo que importa de este doble es
    // que RECHACE cuando el formato no se entiende, y `async` lo conseguía de
    // rebote. Dicho así se lee lo que hace.
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

describe('Encoger un soporte antes de subirlo', () => {
  it('convierte la foto de un teléfono a JPG y la encoge', async () => {
    const { canvas } = fakeBrowser({ width: 4032, height: 3024 });

    const outputBytes = await shrinkReceipt(file('IMG_4821.jpg', 'image/jpeg', 4096));

    expect(outputBytes.type).toBe('image/jpeg');
    expect(outputBytes.size).toBeLessThan(4096 * 1024);
    // El lado largo queda en 1600: por encima del 1100 al que reduce el
    // servidor, para que el recorte final lo decida él.
    expect(canvas()).toEqual({ width: 1600, height: 1200 });
  });

  it('un HEIC se convierte SIEMPRE, aunque sea pequeño', async () => {
    // Su problema no es el peso: es que el servidor no sabe abrir ese formato,
    // y por eso contestaba «Ocurrió un error inesperado».
    fakeBrowser({ width: 800, height: 600, outputBytes: 90 * 1024 });

    const outputBytes = await shrinkReceipt(file('IMG_4821.HEIC', 'image/heic', 300));

    expect(outputBytes.type).toBe('image/jpeg');
    expect(outputBytes.name).toBe('IMG_4821.jpg');
  });

  it('una imagen pequeña Y estrecha no se toca: recodificarla le quita nitidez', async () => {
    // Las dos condiciones. Poco peso por sí solo no basta: ver la prueba de
    // abajo, que es el caso que se nos coló hasta el servidor.
    fakeBrowser({ width: 900, height: 700 });
    const original = file('recorte.png', 'image/png', 200);

    expect(await shrinkReceipt(original)).toBe(original);
  });

  it('una captura LIVIANA pero enorme sí se encoge', async () => {
    /*
      El caso real: pegar una captura de pantalla.

      Pesa 300 KB —por debajo del umbral— y mide 2560 de ancho. Con el filtro
      de solo peso, viajaba entera y el servidor tenía que decodificar esos
      2560px; con los hilos contados de un plan compartido, ahí es donde
      reventaba con «glib: Error creating thread».

      Por eso fallaba PEGAR y no fallaba subir una foto: la foto pesa más, y
      por pesar más sí se encogía aquí.
    */
    const { canvas } = fakeBrowser({ width: 2560, height: 1440, outputBytes: 150 * 1024 });

    const outputBytes = await shrinkReceipt(file('captura.png', 'image/png', 300));

    expect(outputBytes.type).toBe('image/jpeg');
    expect(canvas()).toEqual({ width: 1600, height: 900 });
  });

  it('un PDF no se toca: tiene páginas, y aplanarlo perdería todas menos una', async () => {
    fakeBrowser();
    const original = file('recibo.pdf', 'application/pdf', 4096);

    expect(await shrinkReceipt(original)).toBe(original);
  });

  it('si el navegador no sabe abrir el formato, se sube el original', async () => {
    // Encoger es una mejora, no un requisito: convertirlo en un paso que puede
    // impedir la subida sería cambiar un fallo por otro.
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

  it('si el lienzo no se puede leer, se sube el original', async () => {
    fakeBrowser({ canPaint: false });
    const original = file('foto.jpg', 'image/jpeg', 4096);

    expect(await shrinkReceipt(original)).toBe(original);
  });

  it('una tanda se encoge entera', async () => {
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
