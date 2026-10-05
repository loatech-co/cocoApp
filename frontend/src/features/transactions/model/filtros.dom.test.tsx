// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aParametros, llegaHastaHoy, rangoDe, useFiltros, type Filtros } from './filtros';

const history = vi.hoisted(() => ({
  data: undefined as { first: string | null; last: string | null } | undefined,
}));

vi.mock('@/features/transactions/api/transactions', () => ({
  useHistoria: () => history,
}));

function renderFilters(url = '/', porDefecto?: Parameters<typeof useFiltros>[0]) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ ...useFiltros(porDefecto), search: new URLSearchParams(useLocation().search) }),
    { wrapper },
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-20T15:00:00Z'));
  history.data = undefined;
});
afterEach(() => vi.useRealTimers());

describe('rangoDe', () => {
  it('runs "everything" from the first to the last movement', () => {
    expect(rangoDe('todo', { first: '2022-04-04', last: '2026-05-01' })).toEqual({
      from: '2022-04-04',
      to: '2026-05-01',
    });
  });

  it('falls back to a wide range while the history has not arrived', () => {
    expect(rangoDe('todo')).toEqual({ from: '1970-01-01', to: '2031-12-31' });
  });

  it('starts a custom range on the current month up to today', () => {
    expect(rangoDe('personalizado')).toEqual({ from: '2026-05-01', to: '2026-05-20' });
  });
});

describe('llegaHastaHoy', () => {
  it('is true for a range that reaches today and false for a closed one', () => {
    expect(llegaHastaHoy({ to: '2026-05-20' })).toBe(true);
    expect(llegaHastaHoy({ to: '2026-05-19' })).toBe(false);
  });
});

describe('aParametros', () => {
  const base: Filtros = {
    preset: 'mes-actual',
    from: '2026-05-01',
    to: '2026-05-20',
    categoryIds: [],
  };

  it('sends only the dates when nothing else is filtered', () => {
    expect(aParametros(base)).toEqual({ from: '2026-05-01', to: '2026-05-20' });
  });

  it('joins the categories and sends the search', () => {
    expect(aParametros({ ...base, categoryIds: [3, 7], q: 'celsia' })).toEqual({
      from: '2026-05-01',
      to: '2026-05-20',
      category_ids: '3,7',
      q: 'celsia',
    });
  });
});

describe('useFiltros', () => {
  it('reads the default preset with no active filters from an empty URL', () => {
    const { result } = renderFilters();

    expect(result.current.filtros).toEqual({
      preset: 'mes-actual',
      from: '2026-05-01',
      to: '2026-05-20',
      categoryIds: [],
      q: undefined,
    });
    expect(result.current.hayFiltrosActivos).toBe(false);
  });

  it('reads the preset, categories and search from the URL', () => {
    const { result } = renderFilters('/?rango=anio-pasado&categorias=3,x,-1,7&busca=luz');

    expect(result.current.filtros).toEqual({
      preset: 'anio-pasado',
      from: '2025-01-01',
      to: '2025-12-31',
      categoryIds: [3, 7],
      q: 'luz',
    });
    expect(result.current.hayFiltrosActivos).toBe(true);
  });

  it('reads the hand-written dates of a custom range', () => {
    const { result } = renderFilters('/?rango=personalizado&desde=2026-01-10&hasta=2026-02-10');

    expect(result.current.filtros).toMatchObject({ from: '2026-01-10', to: '2026-02-10' });
  });

  it('ignores hand-written dates when the preset is not custom', () => {
    const { result } = renderFilters('/?rango=mes-pasado&desde=2026-01-10');

    expect(result.current.filtros).toMatchObject({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('uses the movement history for "everything"', () => {
    history.data = { first: '2023-02-01', last: '2026-05-18' };
    const { result } = renderFilters('/', 'todo');

    expect(result.current.filtros).toMatchObject({ from: '2023-02-01', to: '2026-05-18' });
    expect(result.current.hayFiltrosActivos).toBe(false);
  });

  it('a search counts as an active filter', () => {
    const { result } = renderFilters('/?busca=x');

    expect(result.current.hayFiltrosActivos).toBe(true);
  });

  it('switching preset drops the hand-written dates', () => {
    const { result } = renderFilters('/?rango=personalizado&desde=2026-01-10&hasta=2026-02-10');

    act(() => result.current.aplicar({ preset: 'trimestre' }));

    expect(result.current.search.toString()).toBe('rango=trimestre');
    expect(result.current.filtros).toMatchObject({ from: '2026-03-01', to: '2026-05-20' });
  });

  it('going back to the default preset removes it from the URL', () => {
    const { result } = renderFilters('/?rango=trimestre');

    act(() => result.current.aplicar({ preset: 'mes-actual' }));

    expect(result.current.search.has('rango')).toBe(false);
  });

  it('choosing custom keeps the dates already written', () => {
    const { result } = renderFilters('/?desde=2026-01-10&hasta=2026-02-10');

    act(() => result.current.aplicar({ preset: 'personalizado' }));

    expect(result.current.filtros).toMatchObject({
      preset: 'personalizado',
      from: '2026-01-10',
      to: '2026-02-10',
    });
  });

  it('writing a date switches to a custom range so the change sticks', () => {
    const { result } = renderFilters();

    act(() => result.current.aplicar({ from: '2026-02-01' }));
    expect(result.current.filtros).toMatchObject({
      preset: 'personalizado',
      from: '2026-02-01',
      to: '2026-05-20',
    });

    act(() => result.current.aplicar({ to: '2026-02-28' }));
    expect(result.current.filtros).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('writes and clears the categories', () => {
    const { result } = renderFilters();

    act(() => result.current.aplicar({ categoryIds: [4, 9] }));
    expect(result.current.search.get('categorias')).toBe('4,9');

    act(() => result.current.aplicar({ categoryIds: [] }));
    expect(result.current.search.has('categorias')).toBe(false);
  });

  it('writes the search and drops a blank one', () => {
    const { result } = renderFilters();

    act(() => result.current.aplicar({ q: 'agua' }));
    expect(result.current.filtros.q).toBe('agua');

    act(() => result.current.aplicar({ q: '   ' }));
    expect(result.current.search.has('busca')).toBe(false);
  });

  it('clearing empties the URL', () => {
    const { result } = renderFilters('/?rango=trimestre&categorias=3&busca=x');

    act(() => result.current.limpiar());

    expect(result.current.search.toString()).toBe('');
    expect(result.current.hayFiltrosActivos).toBe(false);
  });
});
