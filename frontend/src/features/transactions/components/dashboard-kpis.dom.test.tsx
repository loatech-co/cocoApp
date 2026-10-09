// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Dashboard } from '@/shared/api/generated/model';

import { DashboardKpis } from './dashboard-kpis';

afterEach(cleanup);

const DATA = {
  required_budget: 0,
  range: { expense: 0, income: 0, count: 0 },
  expense_by_center: [],
  period: { from: '2026-01-01', to: '2026-01-31' },
} as unknown as Dashboard;

/*
  The Income card is «Pronto»: dimmed with the theme's ink, never
  with opacity. At 60 % the label and the tag dropped to 2.6:1 and 2.3:1, and
  axe flagged it in the walkthroughs.
*/
describe('The card that is not there yet', () => {
  it('dims without opacity', () => {
    const { container } = render(<DashboardKpis data={DATA} isUpToDate />);

    expect(container.querySelector('[class*="opacity-"]')).toBeNull();
  });

  it('its «Pronto» tag uses the muted tone of the tag', () => {
    render(<DashboardKpis data={DATA} isUpToDate />);

    const isSoon = screen.getByText('Pronto');
    expect(isSoon.className).toContain('bg-muted');
    expect(isSoon.className).toContain('text-muted-foreground');
  });
});
