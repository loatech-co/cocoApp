// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LecturaDeMandos, SeparadorDeMandos } from './overlay-control';

afterEach(cleanup);

describe('LecturaDeMandos', () => {
  it('is a button when it can be pressed', () => {
    const onClick = vi.fn();
    render(
      <LecturaDeMandos ancho="zoom" titulo="Volver al tamaño normal" onClick={onClick}>
        150 %
      </LecturaDeMandos>,
    );

    const lectura = screen.getByRole('button', { name: '150 %' });
    expect(lectura.className).toContain('min-w-[3.5rem]');
    fireEvent.click(lectura);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is only read otherwise', () => {
    render(<LecturaDeMandos ancho="paginas">Pág. 1 / 3</LecturaDeMandos>);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Pág. 1 / 3').tagName).toBe('SPAN');
  });
});

describe('SeparadorDeMandos', () => {
  it('is a division the screen reader skips', () => {
    const { container } = render(<SeparadorDeMandos />);

    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
  });
});
