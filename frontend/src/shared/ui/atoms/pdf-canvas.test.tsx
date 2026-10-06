// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { drawPdfPage } from '@/shared/lib/pdf';

import { PdfCanvas } from './pdf-canvas';

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

describe('PdfCanvas', () => {
  it('draws the first page at the asked width and reports the drawn size', async () => {
    draw.mockResolvedValue({ width: 240, height: 320 });
    const onResize = vi.fn();
    const { container } = render(<PdfCanvas url="/a.pdf" onResize={onResize} />);

    await waitFor(() => expect(onResize).toHaveBeenCalledWith(240, 320));
    const call = firstDrawing();
    expect(call.page).toBe(1);
    expect(call.scale(480)).toBe(0.5);
    expect(call.canvas()).toBe(container.querySelector('canvas'));
    expect(call.isAlive()).toBe(true);
    expect(container.querySelector('canvas')?.className).toContain('object-cover');
  });

  it('shows the whole sheet with contain and does not report a drawing that stopped', async () => {
    draw.mockResolvedValue(null);
    const onResize = vi.fn();
    const { container } = render(<PdfCanvas url="/a.pdf" fit="contain" onResize={onResize} />);

    await waitFor(() => expect(draw).toHaveBeenCalled());
    expect(onResize).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')?.className).toContain('object-contain');
  });

  it('sizes the canvas by the given style instead of filling its box', () => {
    draw.mockResolvedValue(null);
    const { container } = render(<PdfCanvas url="/a.pdf" style={{ width: 100 }} />);

    const canvas = container.querySelector('canvas');
    expect(canvas?.style.width).toBe('100px');
    expect(canvas?.getAttribute('class')).toBeNull();
  });

  it('shows a warning icon when the pdf cannot be drawn', async () => {
    draw.mockRejectedValue(new Error('broken'));
    const { container } = render(<PdfCanvas url="/a.pdf" />);

    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('stops listening once it unmounts', () => {
    draw.mockReturnValue(new Promise(() => undefined));
    const { unmount } = render(<PdfCanvas url="/a.pdf" />);

    unmount();
    expect(firstDrawing().isAlive()).toBe(false);
  });
});
