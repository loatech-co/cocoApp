// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type PendingPayment } from '@/shared/api/generated/model';

import { PendingPayments } from './pending-payments';

/**
 * A concept that is covered in pieces is not «sin pagar».
 *
 * The failure this guards against: at the first transaction, «Mercado» disappeared from the
 * list and for the rest of the month the only screen that answers «what do I still
 * have to pay?» said nothing, with 320,450 paid out of 1,200,000. Now it
 * stays, but then the opposite failure appears: staying WITHOUT saying it already
 * has something paid reads as if nothing had been paid.
 */
afterEach(cleanup);

const BASE = {
  path: 'Costos variables · Alimentación',
  periodicity: 'monthly',
  dueDate: '2999-12-01',
  costCenterId: 1,
  costCenter: 'Costos variables',
} as const;

const MARKET = {
  ...BASE,
  categoryId: 10,
  name: 'Mercado',
  expectedAmount: '1200000',
  paidAmount: '320450',
  isMultiPayment: true,
} as unknown as PendingPayment;

const RENT = {
  ...BASE,
  categoryId: 20,
  name: 'Alquiler',
  path: 'Costos fijos · Vivienda',
  expectedAmount: '2400000',
  paidAmount: '0',
  isMultiPayment: false,
} as unknown as PendingPayment;

function renderPayments(payments: PendingPayment[], onSelect = vi.fn()) {
  render(<PendingPayments payments={payments} onSelect={onSelect} />);
  return onSelect;
}

describe('A pending payment paid in several installments', () => {
  it('says how much is paid so far, not just how much it costs', () => {
    renderPayments([MARKET]);

    // The total stays on the right, like in any pending payment. It shows up twice
    // —in the row and in the card label— and both are correct.
    expect(screen.getAllByText(/1\.200\.000/).length).toBeGreaterThan(0);
    // And what this row adds: how far along it is.
    expect(screen.getByText(/Lleva.*320\.450/)).toBeDefined();
  });

  it('draws a bar with the covered fraction, and announces it', () => {
    renderPayments([MARKET]);

    const bar = screen.getByRole('progressbar');
    // 320450 / 1200000 = 26.7 % → 27.
    expect(bar.getAttribute('aria-valuenow')).toBe('27');
    // Without an accessible name, a growing div says nothing to whoever cannot see it.
    expect(bar.getAttribute('aria-label')).toMatch(/Mercado/);
  });

  it('offers «Registrar otro» and not «confirmar»', () => {
    // What is going to happen on tapping is noting down THIS installment, not marking the month as
    // settled. The label has to say that.
    renderPayments([MARKET]);
    expect(screen.getByText('Registrar otro')).toBeDefined();
  });

  it('when tapped, hands the whole payment to whoever opens the sheet', () => {
    const onSelect = renderPayments([MARKET]);

    fireEvent.click(screen.getByText('Mercado'));

    expect(onSelect).toHaveBeenCalledWith(MARKET);
  });
});

describe('A regular pending payment does not change', () => {
  it('has no bar and no «Registrar otro»', () => {
    renderPayments([RENT]);

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Registrar otro')).toBeNull();
    expect(screen.queryByText(/Lleva/)).toBeNull();
  });

  it('and living next to an installment one, only the other one has it', () => {
    // The bar leaking into neighboring rows would be worse than not having it:
    // it would say an unpaid rent is half paid.
    renderPayments([MARKET, RENT]);

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });
});

describe('Without a total to reach', () => {
  it('no bar is drawn, because it would be a fraction with no denominator', () => {
    // It is already a `PendingPayment`: spreading it does not change the type, so there is
    // nothing to assert.
    const withoutTotal: PendingPayment = { ...MARKET, expectedAmount: null, paidAmount: '50000' };
    renderPayments([withoutTotal]);

    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
