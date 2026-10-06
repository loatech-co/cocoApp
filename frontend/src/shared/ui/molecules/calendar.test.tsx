// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rangoLargo } from '@/shared/lib/format';

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
    expect(rangoLargo('2026-09-01', '2026-09-10')).toBe('1 — 10 de septiembre de 2026');
  });

  it('repeats the month when it changes, but the year only once', () => {
    expect(rangoLargo('2026-08-20', '2026-09-10')).toBe('20 de agosto — 10 de septiembre de 2026');
  });

  it('writes both years when the range crosses from one to the next', () => {
    expect(rangoLargo('2025-12-20', '2026-01-05')).toBe(
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
});
