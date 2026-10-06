// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ControlReadout, ControlSeparator } from './overlay-control';

afterEach(cleanup);

describe('ControlReadout', () => {
  it('is a button when it can be pressed', () => {
    const onClick = vi.fn();
    render(
      <ControlReadout width="zoom" title="Volver al tamaño normal" onClick={onClick}>
        150 %
      </ControlReadout>,
    );

    const readout = screen.getByRole('button', { name: '150 %' });
    expect(readout.className).toContain('min-w-[3.5rem]');
    fireEvent.click(readout);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is only read otherwise', () => {
    render(<ControlReadout width="pages">Pág. 1 / 3</ControlReadout>);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Pág. 1 / 3').tagName).toBe('SPAN');
  });
});

describe('ControlSeparator', () => {
  it('is a division the screen reader skips', () => {
    const { container } = render(<ControlSeparator />);

    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
  });
});
