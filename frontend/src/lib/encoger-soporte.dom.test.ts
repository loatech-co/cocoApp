// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encogerSoporte, encogerSoportes } from './encoger-soporte';

/**
 * Lo que se sube es un JPG liviano, y si no se puede, se sube lo que había.
 *
 * La segunda mitad importa tanto como la primera: encoger es una mejora, no un
 * requisito. Un navegador que no sepa abrir el formato no puede quedarse sin
 * poder adjuntar el recibo.
 */
function archivo(nombre: string, tipo: string, kb: number): File {
  return new File([new Uint8Array(kb * 1024)], nombre, { type: tipo });
}

/** jsdom no dibuja: se finge el lienzo y la decodificación. */
function fingirNavegador({
  ancho = 4032,
  alto = 3024,
  salida = 120 * 1024,
  decodifica = true,
  pintaLienzo = true,
}: {
  ancho?: number;
  alto?: number;
  salida?: number | null;
  decodifica?: boolean;
  pintaLienzo?: boolean;
} = {}): { lienzo: () => { width: number; height: number } } {
  const medidas = { width: 0, height: 0 };

  vi.stubGlobal(
    'createImageBitmap',
    // Promesas explícitas en vez de `async`: lo que importa de este doble es
    // que RECHACE cuando el formato no se entiende, y `async` lo conseguía de
    // rebote. Dicho así se lee lo que hace.
    vi.fn(() =>
      decodifica
        ? Promise.resolve({ width: ancho, height: alto } as unknown as ImageBitmap)
        : Promise.reject(new Error('formato desconocido')),
    ),
  );

  vi.spyOn(document, 'createElement').mockImplementation((etiqueta: string) => {
    if (etiqueta !== 'canvas') {
      return Object.getPrototypeOf(document).createElement.call(document, etiqueta);
    }
    return {
      set width(v: number) {
        medidas.width = v;
      },
      get width() {
        return medidas.width;
      },
      set height(v: number) {
        medidas.height = v;
      },
      get height() {
        return medidas.height;
      },
      getContext: () => (pintaLienzo ? { drawImage: vi.fn() } : null),
      toBlob: (cb: (b: Blob | null) => void) =>
        cb(salida === null ? null : new Blob([new Uint8Array(salida)], { type: 'image/jpeg' })),
    } as unknown as HTMLCanvasElement;
  });

  return { lienzo: () => medidas };
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
    const { lienzo } = fingirNavegador({ ancho: 4032, alto: 3024 });

    const salida = await encogerSoporte(archivo('IMG_4821.jpg', 'image/jpeg', 4096));

    expect(salida.type).toBe('image/jpeg');
    expect(salida.size).toBeLessThan(4096 * 1024);
    // El lado largo queda en 1600: por encima del 1100 al que reduce el
    // servidor, para que el recorte final lo decida él.
    expect(lienzo()).toEqual({ width: 1600, height: 1200 });
  });

  it('un HEIC se convierte SIEMPRE, aunque sea pequeño', async () => {
    // Su problema no es el peso: es que el servidor no sabe abrir ese formato,
    // y por eso contestaba «Ocurrió un error inesperado».
    fingirNavegador({ ancho: 800, alto: 600, salida: 90 * 1024 });

    const salida = await encogerSoporte(archivo('IMG_4821.HEIC', 'image/heic', 300));

    expect(salida.type).toBe('image/jpeg');
    expect(salida.name).toBe('IMG_4821.jpg');
  });

  it('una imagen pequeña Y estrecha no se toca: recodificarla le quita nitidez', async () => {
    // Las dos condiciones. Poco peso por sí solo no basta: ver la prueba de
    // abajo, que es el caso que se nos coló hasta el servidor.
    fingirNavegador({ ancho: 900, alto: 700 });
    const original = archivo('recorte.png', 'image/png', 200);

    expect(await encogerSoporte(original)).toBe(original);
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
    const { lienzo } = fingirNavegador({ ancho: 2560, alto: 1440, salida: 150 * 1024 });

    const salida = await encogerSoporte(archivo('captura.png', 'image/png', 300));

    expect(salida.type).toBe('image/jpeg');
    expect(lienzo()).toEqual({ width: 1600, height: 900 });
  });

  it('un PDF no se toca: tiene páginas, y aplanarlo perdería todas menos una', async () => {
    fingirNavegador();
    const original = archivo('recibo.pdf', 'application/pdf', 4096);

    expect(await encogerSoporte(original)).toBe(original);
  });

  it('si el navegador no sabe abrir el formato, se sube el original', async () => {
    // Encoger es una mejora, no un requisito: convertirlo en un paso que puede
    // impedir la subida sería cambiar un fallo por otro.
    fingirNavegador({ decodifica: false });
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | null = null;
        set src(_: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      },
    );

    const original = archivo('raro.jxl', 'image/jxl', 4096);
    expect(await encogerSoporte(original)).toBe(original);
  });

  it('si el lienzo no se puede leer, se sube el original', async () => {
    fingirNavegador({ pintaLienzo: false });
    const original = archivo('foto.jpg', 'image/jpeg', 4096);

    expect(await encogerSoporte(original)).toBe(original);
  });

  it('una tanda se encoge entera', async () => {
    fingirNavegador();
    const salidas = await encogerSoportes([
      archivo('a.jpg', 'image/jpeg', 4096),
      archivo('b.pdf', 'application/pdf', 4096),
    ]);

    expect(salidas[0].type).toBe('image/jpeg');
    expect(salidas[0].size).toBeLessThan(4096 * 1024);
    expect(salidas[1].type).toBe('application/pdf');
  });
});
