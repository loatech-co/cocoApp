// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showToast, clearToasts, ToastStack } from './toast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => clearToasts());
  cleanup();
  vi.useRealTimers();
});

const show = (...args: Parameters<typeof showToast>) => act(() => showToast(...args));

describe('ToastStack', () => {
  it('renders nothing while there are no notices', () => {
    render(<ToastStack />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces a notice politely, with its headline and its detail', () => {
    render(<ToastStack />);

    show('Movimiento guardado', { detail: 'Ya aparece en la tabla.', tone: 'success' });

    const stack = screen.getByRole('status');
    expect(stack.getAttribute('aria-live')).toBe('polite');
    expect(stack.textContent).toContain('Movimiento guardado');
    expect(stack.textContent).toContain('Ya aparece en la tabla.');
  });

  it('draws a glyph for each severity, hidden from assistive tech, and none for the neutral tone', () => {
    render(<ToastStack />);

    show('Neutro');
    const stack = screen.getByRole('status');
    expect(stack.querySelectorAll('svg')).toHaveLength(0);

    for (const tone of ['destructive', 'warning', 'success', 'info'] as const) {
      show(tone, { tone });
    }
    const glyphs = stack.querySelectorAll('svg');
    expect(glyphs).toHaveLength(4);
    for (const glyph of glyphs) {
      expect(glyph.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('stacks different notices and does not repeat the same one', () => {
    render(<ToastStack />);

    show('Uno');
    show('Dos');
    show('Uno');

    const text = screen.getByRole('status').textContent;
    expect(text.match(/Uno/g)).toHaveLength(1);
    expect(text).toContain('Dos');
  });

  it('forgets a notice after five seconds', () => {
    render(<ToastStack />);
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
    render(<ToastStack />);
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
    render(<ToastStack />);
    show('Uno');
    show('Dos');

    act(() => clearToasts());

    expect(screen.queryByRole('status')).toBeNull();
  });
});
