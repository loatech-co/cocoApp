// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toApiParams, reachesToday, rangeOf, useFilters, type Filters } from './filters';

const history = vi.hoisted(() => ({
  data: undefined as { first: string | null; last: string | null } | undefined,
}));

vi.mock('@/features/transactions/api/transactions', () => ({
  useHistory: () => history,
}));

function renderFilters(url = '/', defaultPreset?: Parameters<typeof useFilters>[0]) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ ...useFilters(defaultPreset), search: new URLSearchParams(useLocation().search) }),
    { wrapper },
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-20T15:00:00Z'));
  history.data = undefined;
});
afterEach(() => vi.useRealTimers());

describe('rangeOf', () => {
  it('runs "everything" from the first to the last transaction', () => {
    expect(rangeOf('all', { first: '2022-04-04', last: '2026-05-01' })).toEqual({
      from: '2022-04-04',
      to: '2026-05-01',
    });
  });

  it('falls back to a wide range while the history has not arrived', () => {
    expect(rangeOf('all')).toEqual({ from: '1970-01-01', to: '2031-12-31' });
  });

  it('starts a custom range on the current month up to today', () => {
    expect(rangeOf('custom')).toEqual({ from: '2026-05-01', to: '2026-05-20' });
  });
});

describe('reachesToday', () => {
  it('is true for a range that reaches today and false for a closed one', () => {
    expect(reachesToday({ to: '2026-05-20' })).toBe(true);
    expect(reachesToday({ to: '2026-05-19' })).toBe(false);
  });
});

describe('toApiParams', () => {
  const base: Filters = {
    preset: 'this-month',
    from: '2026-05-01',
    to: '2026-05-20',
    categoryIds: [],
  };

  it('sends only the dates when nothing else is filtered', () => {
    expect(toApiParams(base)).toEqual({ from: '2026-05-01', to: '2026-05-20' });
  });

  it('joins the categories and sends the search', () => {
    expect(toApiParams({ ...base, categoryIds: [3, 7], q: 'celsia' })).toEqual({
      from: '2026-05-01',
      to: '2026-05-20',
      categoryIds: '3,7',
      q: 'celsia',
    });
  });
});

describe('useFilters', () => {
  it('reads the default preset with no active filters from an empty URL', () => {
    const { result } = renderFilters();

    expect(result.current.filters).toEqual({
      preset: 'this-month',
      from: '2026-05-01',
      to: '2026-05-20',
      categoryIds: [],
      q: undefined,
    });
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('reads the preset, categories and search from the URL', () => {
    const { result } = renderFilters('/?range=last-year&categories=3,x,-1,7&q=luz');

    expect(result.current.filters).toEqual({
      preset: 'last-year',
      from: '2025-01-01',
      to: '2025-12-31',
      categoryIds: [3, 7],
      q: 'luz',
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('reads the hand-written dates of a custom range', () => {
    const { result } = renderFilters('/?range=custom&from=2026-01-10&to=2026-02-10');

    expect(result.current.filters).toMatchObject({ from: '2026-01-10', to: '2026-02-10' });
  });

  it('ignores hand-written dates when the preset is not custom', () => {
    const { result } = renderFilters('/?range=last-month&from=2026-01-10');

    expect(result.current.filters).toMatchObject({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('uses the transaction history for "everything"', () => {
    history.data = { first: '2023-02-01', last: '2026-05-18' };
    const { result } = renderFilters('/', 'all');

    expect(result.current.filters).toMatchObject({ from: '2023-02-01', to: '2026-05-18' });
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('a search counts as an active filter', () => {
    const { result } = renderFilters('/?q=x');

    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('switching preset drops the hand-written dates', () => {
    const { result } = renderFilters('/?range=custom&from=2026-01-10&to=2026-02-10');

    act(() => result.current.apply({ preset: 'last-3-months' }));

    expect(result.current.search.toString()).toBe('range=last-3-months');
    expect(result.current.filters).toMatchObject({ from: '2026-03-01', to: '2026-05-20' });
  });

  it('going back to the default preset removes it from the URL', () => {
    const { result } = renderFilters('/?range=last-3-months');

    act(() => result.current.apply({ preset: 'this-month' }));

    expect(result.current.search.has('range')).toBe(false);
  });

  it('choosing custom keeps the dates already written', () => {
    const { result } = renderFilters('/?from=2026-01-10&to=2026-02-10');

    act(() => result.current.apply({ preset: 'custom' }));

    expect(result.current.filters).toMatchObject({
      preset: 'custom',
      from: '2026-01-10',
      to: '2026-02-10',
    });
  });

  it('writing a date switches to a custom range so the change sticks', () => {
    const { result } = renderFilters();

    act(() => result.current.apply({ from: '2026-02-01' }));
    expect(result.current.filters).toMatchObject({
      preset: 'custom',
      from: '2026-02-01',
      to: '2026-05-20',
    });

    act(() => result.current.apply({ to: '2026-02-28' }));
    expect(result.current.filters).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('writes and clears the categories', () => {
    const { result } = renderFilters();

    act(() => result.current.apply({ categoryIds: [4, 9] }));
    expect(result.current.search.get('categories')).toBe('4,9');

    act(() => result.current.apply({ categoryIds: [] }));
    expect(result.current.search.has('categories')).toBe(false);
  });

  it('writes the search and drops a blank one', () => {
    const { result } = renderFilters();

    act(() => result.current.apply({ q: 'agua' }));
    expect(result.current.filters.q).toBe('agua');

    act(() => result.current.apply({ q: '   ' }));
    expect(result.current.search.has('q')).toBe(false);
  });

  it('clearing empties the URL', () => {
    const { result } = renderFilters('/?range=last-3-months&categories=3&q=x');

    act(() => result.current.clear());

    expect(result.current.search.toString()).toBe('');
    expect(result.current.hasActiveFilters).toBe(false);
  });
});

describe('useFilters with a URL from before the English names', () => {
  it('reads the Spanish parameters and range values', () => {
    const { result } = renderFilters('/?rango=anio-pasado&categorias=3,7&busca=luz');

    expect(result.current.filters).toEqual({
      preset: 'last-year',
      from: '2025-01-01',
      to: '2025-12-31',
      categoryIds: [3, 7],
      q: 'luz',
    });
  });

  it('reads the hand-written dates of a Spanish custom range', () => {
    const { result } = renderFilters('/?rango=personalizado&desde=2026-01-10&hasta=2026-02-10');

    expect(result.current.filters).toMatchObject({
      preset: 'custom',
      from: '2026-01-10',
      to: '2026-02-10',
    });
  });

  it('writes only the English names on the first change', () => {
    const { result } = renderFilters('/?rango=trimestre&categorias=3&busca=x&sheet=9');

    act(() => result.current.apply({ q: 'agua' }));

    expect(result.current.search.toString()).toBe(
      'sheet=9&range=last-3-months&categories=3&q=agua',
    );
  });

  it('prefers the English parameter when both are present', () => {
    const { result } = renderFilters('/?range=this-year&rango=mes-pasado');

    expect(result.current.filters.preset).toBe('this-year');
  });

  it('falls back to the default preset on an unknown range value', () => {
    const { result } = renderFilters('/?range=whenever');

    expect(result.current.filters.preset).toBe('this-month');
  });
});
