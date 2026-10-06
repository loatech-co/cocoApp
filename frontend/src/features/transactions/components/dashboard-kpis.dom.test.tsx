// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Dashboard } from '@/shared/api/generated/model';

import { DashboardKpis } from './dashboard-kpis';

afterEach(cleanup);

const DATOS = {
  required_budget: 0,
  range: { expense: 0, income: 0, count: 0 },
  expense_by_center: [],
  period: { from: '2026-01-01', to: '2026-01-31' },
} as unknown as Dashboard;

/*
  La tarjeta de Ingresos está «Pronto»: apagada con la tinta del tema, nunca
  con opacidad. Al 60 % el rótulo y la etiqueta bajaban a 2,6:1 y 2,3:1, y
  axe lo marcaba en los recorridos.
*/
describe('La tarjeta que todavía no está', () => {
  it('se apaga sin opacidad', () => {
    const { container } = render(<DashboardKpis datos={DATOS} alDia />);

    expect(container.querySelector('[class*="opacity-"]')).toBeNull();
  });

  it('su etiqueta «Pronto» usa el tono apagado de la etiqueta', () => {
    render(<DashboardKpis datos={DATOS} alDia />);

    const pronto = screen.getByText('Pronto');
    expect(pronto.className).toContain('bg-muted');
    expect(pronto.className).toContain('text-muted-foreground');
  });
});
