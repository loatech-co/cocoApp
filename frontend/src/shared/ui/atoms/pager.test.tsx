// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { visiblePageNumbers, Pager } from './pager';

afterEach(cleanup);

describe('Which numbers the pager shows', () => {
  it('with seven pages or fewer, all of them', () => {
    expect(visiblePageNumbers(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('the first and the last are always there', () => {
    // They are the two jumps one wants to make; without them one has to click
    // "next" forty times.
    const nums = visiblePageNumbers(25, 50);
    expect(nums[0]).toBe(1);
    expect(nums.at(-1)).toBe(50);
  });

  it('the current one comes with its neighbors', () => {
    expect(visiblePageNumbers(25, 50)).toEqual([1, null, 24, 25, 26, null, 50]);
  });

  it('a gap of ONE page is drawn as the page, not as dots', () => {
    // "1 … 3" takes the same room as "1 2 3" and hides a page for nothing.
    expect(visiblePageNumbers(3, 20)).toEqual([1, 2, 3, 4, null, 20]);
  });

  it('at the start it leaves no gap in front', () => {
    expect(visiblePageNumbers(1, 20)).toEqual([1, 2, null, 20]);
  });

  it('at the end it leaves no gap behind', () => {
    expect(visiblePageNumbers(20, 20)).toEqual([1, null, 19, 20]);
  });

  it('never repeats a number', () => {
    for (const p of [1, 2, 3, 10, 19, 20]) {
      const nums = visiblePageNumbers(p, 20).filter((n): n is number => n !== null);
      expect(new Set(nums).size).toBe(nums.length);
    }
  });
});

describe('Pager', () => {
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
