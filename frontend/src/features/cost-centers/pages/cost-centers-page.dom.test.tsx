// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CentrosPage } from './cost-centers-page';

const consulta = {
  data: undefined as unknown[] | undefined,
  isPending: false,
  isError: false,
  isSuccess: false,
};

vi.mock('@/shared/api/categories', () => ({ useCategories: () => consulta }));
vi.mock('@/features/cost-centers/components/category-modal', () => ({
  CategoriaModal: () => null,
}));
vi.mock('@/features/cost-centers/components/cost-center-card', () => ({ Centro: () => null }));

afterEach(cleanup);

describe('CentrosPage when the tree fails to load', () => {
  it('says it failed and does NOT invite to create (that duplicates centers)', () => {
    Object.assign(consulta, { data: undefined, isError: true, isSuccess: false });
    render(<CentrosPage />);

    expect(screen.getByRole('alert').textContent).toContain(
      'No se pudieron cargar los centros de costos',
    );
    expect(screen.queryByText('Todavía no hay centros de costos.')).toBeNull();
  });

  it('a truly empty tree still invites to create', () => {
    Object.assign(consulta, { data: [], isError: false, isSuccess: true });
    render(<CentrosPage />);

    expect(screen.getByText('Todavía no hay centros de costos.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
