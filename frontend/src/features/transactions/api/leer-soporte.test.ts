/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createWorker = vi.fn();

vi.mock('tesseract.js', () => ({ createWorker }));
vi.mock('@/shared/api/generated/interpretacion-v2/interpretacion-v2', () => ({
  interpretacionInterpret: vi.fn(() => Promise.reject(new Error('sin servidor'))),
}));

const { leerSoporte, rutasDelOcr } = await import('./leer-soporte');

describe('the OCR engine is served from our own origin', () => {
  beforeEach(() => {
    createWorker.mockReset();
    createWorker.mockResolvedValue({
      recognize: vi.fn(() => Promise.resolve({ data: { text: 'texto' } })),
      terminate: vi.fn(() => Promise.resolve()),
    });
  });

  it('points the worker, the core and the language data at /tesseract/', () => {
    expect(rutasDelOcr('https://coco.example/cuentas')).toEqual({
      workerPath: 'https://coco.example/tesseract/worker.min.js',
      corePath: 'https://coco.example/tesseract/core',
      langPath: 'https://coco.example/tesseract/lang',
      gzip: false,
      workerBlobURL: false,
    });
  });

  it('passes those paths to createWorker, so nothing is fetched from a CDN', async () => {
    const imagen = new File(['x'], 'recibo.png', { type: 'image/png' });

    // The interpretation fails on purpose: what matters here is the OCR.
    await expect(leerSoporte(imagen)).rejects.toThrow();

    expect(createWorker).toHaveBeenCalledOnce();
    const [idioma, , opciones] = createWorker.mock.calls[0] as [string, unknown, object];
    expect(idioma).toBe('spa');
    expect(opciones).toMatchObject(rutasDelOcr());

    const urls = Object.values(opciones).filter((v): v is string => typeof v === 'string');
    expect(urls).toHaveLength(3);
    for (const url of urls) {
      expect(new URL(url).origin).toBe(window.location.origin);
      expect(url).not.toMatch(/jsdelivr|unpkg|cdn/i);
    }
  });
});
