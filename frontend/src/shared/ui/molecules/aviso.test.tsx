// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mostrarAviso, olvidarAvisos, PilaDeAvisos } from './aviso';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => olvidarAvisos());
  cleanup();
  vi.useRealTimers();
});

const show = (...args: Parameters<typeof mostrarAviso>) => act(() => mostrarAviso(...args));

describe('PilaDeAvisos', () => {
  it('renders nothing while there are no notices', () => {
    render(<PilaDeAvisos />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces a notice politely, with its headline and its detail', () => {
    render(<PilaDeAvisos />);

    show('Movimiento guardado', { detalle: 'Ya aparece en la tabla.', tono: 'success' });

    const stack = screen.getByRole('status');
    expect(stack.getAttribute('aria-live')).toBe('polite');
    expect(stack.textContent).toContain('Movimiento guardado');
    expect(stack.textContent).toContain('Ya aparece en la tabla.');
  });

  it('draws a glyph for each severity, hidden from assistive tech, and none for the neutral tone', () => {
    render(<PilaDeAvisos />);

    show('Neutro');
    const stack = screen.getByRole('status');
    expect(stack.querySelectorAll('svg')).toHaveLength(0);

    for (const tono of ['destructive', 'warning', 'success', 'info'] as const) {
      show(tono, { tono });
    }
    const glyphs = stack.querySelectorAll('svg');
    expect(glyphs).toHaveLength(4);
    for (const glyph of glyphs) {
      expect(glyph.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('stacks different notices and does not repeat the same one', () => {
    render(<PilaDeAvisos />);

    show('Uno');
    show('Dos');
    show('Uno');

    const text = screen.getByRole('status').textContent;
    expect(text.match(/Uno/g)).toHaveLength(1);
    expect(text).toContain('Dos');
  });

  it('forgets a notice after five seconds', () => {
    render(<PilaDeAvisos />);
    show('Guardado');

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('restarts the clock when the same notice is shown again', () => {
    render(<PilaDeAvisos />);
    show('Guardado');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    show('Guardado');
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByRole('status').textContent).toContain('Guardado');
  });

  it('clears every notice at once', () => {
    render(<PilaDeAvisos />);
    show('Uno');
    show('Dos');

    act(() => olvidarAvisos());

    expect(screen.queryByRole('status')).toBeNull();
  });
});
