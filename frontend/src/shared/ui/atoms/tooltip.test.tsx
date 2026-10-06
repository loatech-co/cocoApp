// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WithTooltip } from './tooltip';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTooltip() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 50,
    width: 40,
  } as DOMRect);
  render(
    <WithTooltip text="Pagado con tarjeta">
      <span>icono</span>
    </WithTooltip>,
  );
  return screen.getByText('icono').parentElement!;
}

describe('ConTooltip', () => {
  it('hides the hint until it is asked for', () => {
    renderTooltip();

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the hint above the centre of its anchor when the pointer enters', () => {
    const anchor = renderTooltip();

    fireEvent.pointerEnter(anchor);

    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Pagado con tarjeta');
    expect(tip.style.left).toBe('120px');
    expect(tip.style.top).toBe('42px');
  });

  it('hides the hint when the pointer leaves', () => {
    const anchor = renderTooltip();

    fireEvent.pointerEnter(anchor);
    fireEvent.pointerLeave(anchor);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('can be reached with the keyboard and shows the hint on focus', () => {
    const anchor = renderTooltip();

    expect(anchor.tabIndex).toBe(0);
    fireEvent.focus(anchor);
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.blur(anchor);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

/**
 * The hint is ANNOUNCED, not only shown: the anchor names it with
 * `aria-describedby`, and the reference holds before it appears, which is
 * exactly when a screen reader reaches the anchor.
 */
describe('ConTooltip and the screen reader', () => {
  it('points the anchor at the hint before showing it', () => {
    const anchor = renderTooltip();
    const id = anchor.getAttribute('aria-describedby');

    expect(id).toBeTruthy();
    const hint = document.getElementById(id!);
    expect(hint?.getAttribute('role')).toBe('tooltip');
    expect(hint?.textContent).toBe('Pagado con tarjeta');
  });

  it('is described by the visible hint once focused', () => {
    const anchor = renderTooltip();

    fireEvent.focus(anchor);

    expect(screen.getByRole('tooltip').id).toBe(anchor.getAttribute('aria-describedby'));
  });
});
