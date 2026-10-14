// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { longRange } from '@/shared/lib/format';

import { Calendar, monthCells } from './calendar';

afterEach(cleanup);

describe('The calendar grid', () => {
  it('starts on Monday: September 2026 begins on a Tuesday and leaves one gap', () => {
    const cells = monthCells(2026, 8);
    // September 1, 2026 is a Tuesday: a single empty cell in front.
    expect(cells.slice(0, 3)).toEqual([null, '2026-09-01', '2026-09-02']);
  });

  it('neither loses nor invents days: all 30 of September are there', () => {
    const days = monthCells(2026, 8).filter((c): c is string => c !== null);
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toBe('2026-09-30');
  });

  it('leaves no gap in front when the month starts on Monday', () => {
    // June 1, 2026, a Monday.
    expect(monthCells(2026, 5)[0]).toBe('2026-06-01');
  });

  it('leaves a gap of SIX cells when the month starts on Sunday', () => {
    // With the week starting on Sunday this would be the no-gap case; here it is the largest.
    // February 1, 2026, a Sunday.
    const cells = monthCells(2026, 1);
    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-02-01']);
  });

  it('fills the last row so the grid is rectangular', () => {
    // A half row would misalign the range band against the edge.
    expect(monthCells(2026, 8).length % 7).toBe(0);
  });

  it('respects leap years', () => {
    const days = monthCells(2024, 1).filter((c) => c !== null);
    expect(days).toHaveLength(29);
  });
});

describe('The written range', () => {
  it('with full month and year, and without repeating them when they are the same', () => {
    expect(longRange('2026-09-01', '2026-09-10')).toBe('1 — 10 de septiembre de 2026');
  });

  it('repeats the month when it changes, but the year only once', () => {
    expect(longRange('2026-08-20', '2026-09-10')).toBe('20 de agosto — 10 de septiembre de 2026');
  });

  it('writes both years when the range crosses from one to the next', () => {
    expect(longRange('2025-12-20', '2026-01-05')).toBe(
      '20 de diciembre de 2025 — 5 de enero de 2026',
    );
  });
});

describe('Calendar', () => {
  const monthShown = (): string | null =>
    document.querySelector('[aria-live="polite"]')?.textContent ?? null;

  it('opens on the month of the first end and announces it politely', () => {
    render(<Calendar from="2026-09-10" onSelectDay={vi.fn()} />);

    expect(monthShown()).toBe('septiembre de 2026');
  });

  it('names every day in full for assistive tech and reports the one pressed', () => {
    const onSelectDay = vi.fn();
    render(<Calendar from="2026-09-10" onSelectDay={onSelectDay} />);

    fireEvent.click(screen.getByRole('button', { name: '15 de septiembre de 2026' }));

    expect(onSelectDay).toHaveBeenCalledWith('2026-09-15');
  });

  it('marks one end as pressed when it paints a single day', () => {
    render(<Calendar from="2026-09-10" to="2026-09-10" onSelectDay={vi.fn()} />);

    const pressed = screen.getAllByRole('button', { pressed: true });
    expect(pressed.map((b) => b.getAttribute('aria-label'))).toEqual(['10 de septiembre de 2026']);
  });

  it('marks both ends of a range as pressed and shades the days between with the accent', () => {
    render(<Calendar from="2026-09-10" to="2026-09-12" onSelectDay={vi.fn()} />);

    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2);
    const middle = screen.getByRole('button', { name: '11 de septiembre de 2026' });
    expect(middle.getAttribute('aria-pressed')).toBe('false');
    expect(middle.parentElement!.className).toContain('bg-accent');
  });

  it('moves between months on its own, across the year boundary', () => {
    render(<Calendar to="2026-01-05" onSelectDay={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(monthShown()).toBe('diciembre de 2025');

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(monthShown()).toBe('febrero de 2026');
  });

  it('lets the caller own the visible month', () => {
    const onViewChange = vi.fn();
    render(
      <Calendar
        view={{ year: 2026, month: 11 }}
        onViewChange={onViewChange}
        onSelectDay={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));

    expect(onViewChange).toHaveBeenCalledWith({ year: 2027, month: 0 });
    expect(monthShown()).toBe('diciembre de 2026');
  });

  it('reports the day under the pointer and clears it on leaving the grid', () => {
    const onHover = vi.fn();
    render(<Calendar from="2026-09-10" onSelectDay={vi.fn()} onHover={onHover} />);

    const day = screen.getByRole('button', { name: '20 de septiembre de 2026' });
    fireEvent.mouseEnter(day);
    fireEvent.mouseLeave(day.parentElement!.parentElement!);

    expect(onHover.mock.calls).toEqual([['2026-09-20'], [null]]);
  });

  it('opens on the current month when it has no dates', () => {
    render(<Calendar onSelectDay={vi.fn()} />);

    expect(monthShown()).toMatch(/ de \d{4}$/);
  });

  it('rings today by the Bogotá clock: late in the evening UTC has already turned', () => {
    vi.useFakeTimers();
    // 02:30 UTC on the 15th is 21:30 on the 14th in Bogotá.
    vi.setSystemTime(new Date('2026-03-15T02:30:00Z'));
    try {
      render(<Calendar onSelectDay={vi.fn()} />);

      expect(monthShown()).toBe('marzo de 2026');
      const ringed = (name: string) =>
        screen.getByRole('button', { name }).className.includes('ring-accent-ink');
      expect(ringed('14 de marzo de 2026')).toBe(true);
      expect(ringed('15 de marzo de 2026')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * On the phone the range band lives inside the cells: it starts and ends at
 * the center of the two ends —under their circles— and is flush and square
 * where a week wraps, so nothing of it reaches past the grid.
 */
describe('The range band on the phone', () => {
  function band(day: string): string | undefined {
    const cell = screen.getByRole('button', {
      name: new RegExp(`^${day} de octubre`),
    }).parentElement!;
    return cell.querySelector('span[aria-hidden="true"]')?.className;
  }

  it('runs from the center of the first day to the center of the last', () => {
    render(
      <Calendar
        from="2026-10-01"
        to="2026-10-14"
        view={{ year: 2026, month: 9 }}
        onViewChange={() => {}}
        onSelectDay={() => {}}
      />,
    );

    expect(band('1')).toContain('left-1/2');
    expect(band('14')).toContain('right-1/2');
    // Sunday the 4th and Monday the 5th: the week wraps, the band is square.
    expect(band('4')).toContain('right-0');
    expect(band('5')).toContain('left-0');
    expect(band('4')).not.toContain('rounded');
    expect(band('15')).toBeUndefined();
  });
});
