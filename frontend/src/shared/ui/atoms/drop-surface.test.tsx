// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DropSurface } from './drop-surface';

afterEach(cleanup);

function box(props: { shape: 'square' | 'full'; isOver: boolean; isBusy: boolean }) {
  const onPick = vi.fn();
  render(
    <DropSurface {...props} label="Agregar soportes" onPick={onPick}>
      <span>rótulo</span>
    </DropSurface>,
  );
  const button = screen.getByRole('button', { name: 'Agregar soportes' });
  return { button, frame: button.parentElement!, onPick };
}

describe('DropSurface', () => {
  it('opens the picker from anywhere in the box', () => {
    const { button, frame, onPick } = box({ shape: 'square', isOver: false, isBusy: false });

    expect(frame.className).toContain('size-[104px]');
    expect(frame.textContent).toBe('rótulo');
    fireEvent.click(button);
    expect(onPick).toHaveBeenCalledOnce();
  });

  it('lights up while something is dragged over it', () => {
    const { frame } = box({ shape: 'full', isOver: true, isBusy: false });

    expect(frame.className).toContain('min-h-36');
    expect(frame.className).toContain('border-accent-ink');
  });

  it('cannot be pressed while it uploads', () => {
    const { button, frame } = box({ shape: 'square', isOver: true, isBusy: true });

    expect(button).toHaveProperty('disabled', true);
    expect(frame.className).toContain('cursor-wait');
  });
});
