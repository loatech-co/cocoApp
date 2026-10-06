// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BottomSheet } from './bottom-sheet';

afterEach(cleanup);

function Host({ onClose }: { onClose?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        abrir
      </button>
      <BottomSheet
        isOpen={isOpen}
        title="Atajos"
        onClose={() => {
          setIsOpen(false);
          onClose?.();
        }}
      >
        <p>lo de dentro</p>
      </BottomSheet>
    </>
  );
}

describe('The bottom sheet', () => {
  it('is mounted before opening: what slides is not rebuilt', () => {
    render(<Host />);
    const panel = screen.getByRole('dialog', { hidden: true });

    expect(panel.dataset.abierta).toBe('no');

    // The SAME node after opening. A rebuilt one would have no previous
    // position to travel from: it would appear, it would never arrive.
    fireEvent.click(screen.getByText('abrir'));
    expect(screen.getByRole('dialog').isSameNode(panel)).toBe(true);
    expect(panel.dataset.abierta).toBe('si');
  });

  it('is not tabbable when closed', () => {
    render(<Host />);
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('inert')).toBe(true);

    fireEvent.click(screen.getByText('abrir'));
    expect(screen.getByRole('dialog').hasAttribute('inert')).toBe(false);
  });

  it('Escape is one of the exits', () => {
    const close = vi.fn();
    render(<Host onClose={close} />);
    fireEvent.click(screen.getByText('abrir'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalled();
  });

  it('the scrim is another', () => {
    const close = vi.fn();
    render(<Host onClose={close} />);
    fireEvent.click(screen.getByText('abrir'));

    const overlay = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(overlay);
    expect(close).toHaveBeenCalled();
  });

  it('and the handle is there, even though it is not a control', () => {
    render(<Host />);
    const panel = screen.getByRole('dialog', { hidden: true });
    // An indicator: no accessible name, not a button. The gesture is read on
    // the whole panel, not on top of the line.
    expect(panel.querySelector('[aria-hidden="true"] .rounded-full')).toBeTruthy();
  });
});
