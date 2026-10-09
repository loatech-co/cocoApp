/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createWorker = vi.fn();

vi.mock('tesseract.js', () => ({ createWorker }));
vi.mock('@/shared/api/generated/interpretation-v2/interpretation-v2', () => ({
  interpretationInterpret: vi.fn(() => Promise.reject(new Error('sin servidor'))),
}));

const { readReceipt, ocrPaths } = await import('./read-receipt');

describe('the OCR engine is served from our own origin', () => {
  beforeEach(() => {
    createWorker.mockReset();
    createWorker.mockResolvedValue({
      recognize: vi.fn(() => Promise.resolve({ data: { text: 'texto' } })),
      terminate: vi.fn(() => Promise.resolve()),
    });
  });

  it('points the worker, the core and the language data at /tesseract/', () => {
    expect(ocrPaths('https://coco.example/cuentas')).toEqual({
      workerPath: 'https://coco.example/tesseract/worker.min.js',
      corePath: 'https://coco.example/tesseract/core',
      langPath: 'https://coco.example/tesseract/lang',
      gzip: false,
      workerBlobURL: false,
    });
  });

  it('passes those paths to createWorker, so nothing is fetched from a CDN', async () => {
    const image = new File(['x'], 'recibo.png', { type: 'image/png' });

    // The interpretation fails on purpose: what matters here is the OCR.
    await expect(readReceipt(image)).rejects.toThrow();

    expect(createWorker).toHaveBeenCalledOnce();
    const [locale, , options] = createWorker.mock.calls[0] as [string, unknown, object];
    expect(locale).toBe('spa');
    expect(options).toMatchObject(ocrPaths());

    const urls = Object.values(options).filter((v): v is string => typeof v === 'string');
    expect(urls).toHaveLength(3);
    for (const url of urls) {
      expect(new URL(url).origin).toBe(window.location.origin);
      expect(url).not.toMatch(/jsdelivr|unpkg|cdn/i);
    }
  });
});
