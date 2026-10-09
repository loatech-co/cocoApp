// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountsPage } from './accounts-page';

const query = {
  data: undefined as unknown[] | undefined,
  isPending: false,
  isError: false,
  isSuccess: false,
};

vi.mock('@/features/bank-accounts/api/accounts', () => ({
  useAccounts: () => query,
  useArchiveAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAccount: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe('AccountsPage', () => {
  it('a failed load shows the error, not an empty page', () => {
    Object.assign(query, { data: undefined, isError: true, isSuccess: false });
    render(<AccountsPage />);

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las cuentas');
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).toBeNull();
  });

  it('no accounts at all invites to create one', () => {
    Object.assign(query, { data: [], isError: false, isSuccess: true });
    render(<AccountsPage />);

    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
