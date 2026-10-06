// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CostCentersPage } from './cost-centers-page';

const query = {
  data: undefined as unknown[] | undefined,
  isPending: false,
  isError: false,
  isSuccess: false,
};

vi.mock('@/shared/api/categories', () => ({ useCategories: () => query }));
vi.mock('@/features/cost-centers/components/category-modal', () => ({
  CategoryModal: () => null,
}));
vi.mock('@/features/cost-centers/components/cost-center-card', () => ({
  CostCenterCard: () => null,
}));

afterEach(cleanup);

describe('CostCentersPage when the tree fails to load', () => {
  it('says it failed and does NOT invite to create (that duplicates centers)', () => {
    Object.assign(query, { data: undefined, isError: true, isSuccess: false });
    render(<CostCentersPage />);

    expect(screen.getByRole('alert').textContent).toContain(
      'No se pudieron cargar los centros de costos',
    );
    expect(screen.queryByText('Todavía no hay centros de costos.')).toBeNull();
  });

  it('a truly empty tree still invites to create', () => {
    Object.assign(query, { data: [], isError: false, isSuccess: true });
    render(<CostCentersPage />);

    expect(screen.getByText('Todavía no hay centros de costos.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
