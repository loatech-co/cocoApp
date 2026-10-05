// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { drawPdfPage } from '@/shared/lib/pdf';

import { ANCHO_HOJA, PaginaPdf } from './pdf-page';

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

describe('PaginaPdf', () => {
  it('draws the asked page at twice the shown size and hides the spinner when done', async () => {
    draw.mockResolvedValue({ width: 1240, height: 1600 });
    const onPaginas = vi.fn();
    const { container } = render(
      <PaginaPdf url="/a.pdf" pagina={2} escala={1.5} onPaginas={onPaginas} />,
    );

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    const call = firstDrawing();
    expect(call.page).toBe(2);
    expect(call.scale(ANCHO_HOJA)).toBe(3);
    expect(call.onPages).toBe(onPaginas);
    expect(call.canvas()).toBe(container.querySelector('canvas'));
    expect(container.querySelector('canvas')?.style.width).toBe(`${ANCHO_HOJA * 1.5}px`);
  });

  it('keeps the spinner while a drawing that stopped halfway has not finished', async () => {
    draw.mockResolvedValue(null);
    const { container } = render(
      <PaginaPdf url="/a.pdf" pagina={1} escala={1} onPaginas={vi.fn()} />,
    );

    await waitFor(() => expect(draw).toHaveBeenCalled());
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('says so when the pdf cannot be drawn', async () => {
    draw.mockRejectedValue(new Error('broken'));
    render(<PaginaPdf url="/a.pdf" pagina={1} escala={1} onPaginas={vi.fn()} />);

    expect(await screen.findByText('No se pudo dibujar este PDF.')).toBeTruthy();
  });

  it('stops listening once it unmounts', () => {
    draw.mockReturnValue(new Promise(() => undefined));
    const { unmount } = render(
      <PaginaPdf url="/a.pdf" pagina={1} escala={1} onPaginas={vi.fn()} />,
    );

    unmount();
    expect(firstDrawing().isAlive()).toBe(false);
  });
});
