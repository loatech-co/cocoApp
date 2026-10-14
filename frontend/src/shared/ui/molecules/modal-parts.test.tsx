// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MOBILE_QUERY } from '@/shared/lib/mobile';
import { SHEET_TOP_CORNERS } from '@/shared/ui/atoms/bottom-sheet';

import { ModalFooter, ModalHeader, modalSheetPanel, useSheetClose } from './modal-parts';

/** The screen and the motion preference that `matchMedia` answers. */
function screenIs({ isMobile, isStill = false }: { isMobile: boolean; isStill?: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query === MOBILE_QUERY ? isMobile : query.includes('reduced-motion') && isStill,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('The sheet presentation of a modal', () => {
  it('rises with the top corners of a bottom sheet, and is the centered card on the desktop', () => {
    const panel = modalSheetPanel(false);
    expect(panel).toContain(SHEET_TOP_CORNERS);
    expect(panel).toContain('rise');
    expect(panel).toContain('desktop:rounded-lg');
    expect(modalSheetPanel(true)).toContain('sink');
    // At least 500 high on the phone, unless the screen is shorter.
    expect(panel).toContain('mobile:min-h-[min(500px,92dvh)]');
  });

  it('on the phone, closes only after the sheet has gone down', () => {
    vi.useFakeTimers();
    screenIs({ isMobile: true });
    const onClose = vi.fn();
    const { result } = renderHook(() => useSheetClose(true, onClose));

    act(() => result.current.close());
    expect(result.current.isClosing).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    act(() => result.current.close());
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once on the desktop, and for whoever asked for less motion', () => {
    for (const screen of [{ isMobile: false }, { isMobile: true, isStill: true }]) {
      screenIs(screen);
      const onClose = vi.fn();
      const { result } = renderHook(() => useSheetClose(true, onClose));

      act(() => result.current.close());
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(result.current.isClosing).toBe(false);
    }
  });

  it('rises again on the next opening', () => {
    vi.useFakeTimers();
    screenIs({ isMobile: true });
    const { result, rerender } = renderHook(({ isOpen }) => useSheetClose(isOpen, () => {}), {
      initialProps: { isOpen: true },
    });

    act(() => result.current.close());
    rerender({ isOpen: false });
    rerender({ isOpen: true });
    expect(result.current.isClosing).toBe(false);
  });
});

describe('The actions of a modal, sheet or drawer on the phone', () => {
  it('stack at full width in the order written, and go in a row only on the desktop', () => {
    render(
      <ModalFooter>
        <button type="button">Cancelar</button>
        <button type="button">Registrar</button>
      </ModalFooter>,
    );
    const footer = screen.getByRole('button', { name: 'Cancelar' }).parentElement!;

    expect(footer.className.split(' ')).toEqual(
      expect.arrayContaining(['flex-col', '[&>*]:w-full', 'desktop:flex-row']),
    );
    expect(footer.className).not.toMatch(/(^| )sm:flex-row/);
    expect(footer.firstElementChild!.textContent).toBe('Cancelar');
  });
});

describe('The head of the transaction sheet on the phone', () => {
  it('is the shared sheet head: 24 from the top, everything from the top, a title that wraps', () => {
    render(
      <ModalHeader isSheet title="Nuevo gasto" leading={<span>icono</span>} onClose={vi.fn()} />,
    );
    const title = screen.getByRole('heading', { name: 'Nuevo gasto' });
    const row = title.parentElement!.parentElement!;

    expect(row.parentElement!.className).toContain('mobile:pt-6');
    expect(row.className).toContain('mobile:items-start');
    expect(title.parentElement!.className).toContain('mobile:min-h-[42px]');
    expect(title.className).toContain('mobile:whitespace-normal');
  });
});
