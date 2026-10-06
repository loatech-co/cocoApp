// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { visiblePageNumbers, Pager } from './pager';

afterEach(cleanup);

describe('Qué números se ven en el paginador', () => {
  it('con siete páginas o menos, todas', () => {
    expect(visiblePageNumbers(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('siempre están el primero y el último', () => {
    // Son los dos saltos que uno quiere dar; sin ellos hay que pulsar
    // "siguiente" cuarenta veces.
    const nums = visiblePageNumbers(25, 50);
    expect(nums[0]).toBe(1);
    expect(nums.at(-1)).toBe(50);
  });

  it('la actual va con sus vecinas', () => {
    expect(visiblePageNumbers(25, 50)).toEqual([1, null, 24, 25, 26, null, 50]);
  });

  it('un salto de UNA página se dibuja como la página, no como puntos', () => {
    // "1 … 3" ocupa lo mismo que "1 2 3" y esconde una página por nada.
    expect(visiblePageNumbers(3, 20)).toEqual([1, 2, 3, 4, null, 20]);
  });

  it('al principio no deja un salto delante', () => {
    expect(visiblePageNumbers(1, 20)).toEqual([1, 2, null, 20]);
  });

  it('al final no deja un salto detrás', () => {
    expect(visiblePageNumbers(20, 20)).toEqual([1, null, 19, 20]);
  });

  it('nunca repite un número', () => {
    for (const p of [1, 2, 3, 10, 19, 20]) {
      const nums = visiblePageNumbers(p, 20).filter((n): n is number => n !== null);
      expect(new Set(nums).size).toBe(nums.length);
    }
  });
});

describe('Paginador', () => {
  it('renders nothing when everything fits in one page', () => {
    const { container } = render(<Pager page={1} total={10} perPage={25} onPageChange={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });

  it('is a named navigation that marks the current page', () => {
    render(<Pager page={3} total={100} perPage={10} onPageChange={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Página 3' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('button', { name: 'Página 4' }).hasAttribute('aria-current')).toBe(
      false,
    );
  });

  it('jumps to the page that is pressed, and steps with previous and next', () => {
    const onPageChange = vi.fn();
    render(<Pager page={3} total={100} perPage={10} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Página 10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(onPageChange.mock.calls).toEqual([[10], [2], [4]]);
  });

  it('disables previous on the first page and next on the last', () => {
    const { rerender } = render(<Pager page={1} total={30} perPage={10} onPageChange={vi.fn()} />);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Página anterior' }).disabled,
    ).toBe(true);

    rerender(<Pager page={3} total={30} perPage={10} onPageChange={vi.fn()} />);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Página siguiente' }).disabled,
    ).toBe(true);
  });

  it('draws a gap for the pages it skips', () => {
    render(<Pager page={10} total={200} perPage={10} onPageChange={vi.fn()} />);

    expect(screen.getAllByText('…')).toHaveLength(2);
  });
});
