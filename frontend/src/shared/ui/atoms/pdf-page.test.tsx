// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { drawPdfPage } from '@/shared/lib/pdf';

import { PAGE_WIDTH, PdfPage, RECEIPT_PAGE } from './pdf-page';

vi.mock('@/shared/lib/pdf', () => ({ drawPdfPage: vi.fn() }));
const draw = vi.mocked(drawPdfPage);

/** What the component asked `drawPdfPage` for, the first time. */
function firstDrawing(): Parameters<typeof drawPdfPage>[0] {
  const call = draw.mock.calls[0];
  if (!call) throw new Error('drawPdfPage was never called');
  return call[0];
}

afterEach(() => {
  cleanup();
  draw.mockReset();
});

describe('PdfPage', () => {
  it('draws the asked page at twice the shown size and hides the spinner when done', async () => {
    draw.mockResolvedValue({ width: 1240, height: 1600 });
    const onPageCount = vi.fn();
    const { container } = render(
      <PdfPage url="/a.pdf" page={2} scale={1.5} onPageCount={onPageCount} />,
    );

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    const call = firstDrawing();
    expect(call.page).toBe(2);
    expect(call.scale(PAGE_WIDTH)).toBe(3);
    expect(call.onPages).toBe(onPageCount);
    expect(call.canvas()).toBe(container.querySelector('canvas'));
    expect(container.querySelector('canvas')?.style.width).toBe(`${PAGE_WIDTH * 1.5}px`);
  });

  it('keeps the spinner while a drawing that stopped halfway has not finished', async () => {
    draw.mockResolvedValue(null);
    const { container } = render(<PdfPage url="/a.pdf" page={1} scale={1} onPageCount={vi.fn()} />);

    await waitFor(() => expect(draw).toHaveBeenCalled());
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('says so when the pdf cannot be drawn', async () => {
    draw.mockRejectedValue(new Error('broken'));
    render(<PdfPage url="/a.pdf" page={1} scale={1} onPageCount={vi.fn()} />);

    expect(await screen.findByText('No se pudo dibujar este PDF.')).toBeTruthy();
  });

  it('stops listening once it unmounts', () => {
    draw.mockReturnValue(new Promise(() => undefined));
    const { unmount } = render(<PdfPage url="/a.pdf" page={1} scale={1} onPageCount={vi.fn()} />);

    unmount();
    expect(firstDrawing().isAlive()).toBe(false);
  });
});

/**
 * A receipt keeps its shape. In Safari `h-fit` on an image resolves to its
 * NATURAL height whatever its width: a tall receipt shown at the phone's
 * width came out stretched three times. The page's height must follow its
 * ratio (`h-auto`), and nothing that draws a receipt may force it.
 */
describe('A receipt page keeps its aspect ratio', () => {
  it('sets only the width: the height is auto and the row does not stretch it', () => {
    const classes = RECEIPT_PAGE.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['h-auto', 'self-start']));
    expect(classes).not.toContain('h-fit');
  });

  it('no receipt image or canvas in the app forces its height with h-fit', () => {
    const offenders = [
      'features/transactions/components/receipt-viewer.tsx',
      'shared/ui/atoms/pdf-page.tsx',
    ]
      .map(
        (path) =>
          [path, readFileSync(join(import.meta.dirname, '..', '..', '..', path), 'utf8')] as const,
      )
      .filter(([, code]) => /\bh-fit\b/.test(code.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
