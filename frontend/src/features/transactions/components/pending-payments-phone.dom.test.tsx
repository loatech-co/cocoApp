// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PendingPayment } from '@/shared/api/generated/model';
import { atWidth } from '@/test-support/transaction-sheet';

import { PendingPayments } from './pending-payments';

const BASE = {
  periodicity: 'monthly',
  costCenterId: 1,
  costCenter: 'Costos variables',
} as const;

const MARKET = {
  ...BASE,
  categoryId: 10,
  name: 'Mercado',
  path: 'Costos variables · Alimentación',
  dueDate: '2999-12-01',
  expectedAmount: '1200000',
  paidAmount: '320450',
  isMultiPayment: true,
} as unknown as PendingPayment;

const RENT = {
  ...BASE,
  categoryId: 20,
  name: 'Alquiler',
  path: 'Costos fijos · Vivienda',
  dueDate: '2000-01-05',
  expectedAmount: '2400000',
  paidAmount: '0',
  isMultiPayment: false,
} as unknown as PendingPayment;

function renderPayments(onSelect = vi.fn()) {
  render(<PendingPayments payments={[MARKET, RENT]} onSelect={onSelect} />);
  return onSelect;
}

/** The toggle of a row, by its concept. */
const toggle = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => atWidth(true));
afterEach(() => {
  cleanup();
  atWidth(false);
});

describe('Pending payments, on the phone', () => {
  it('shows each one closed: the concept and the amount, nothing else', () => {
    renderPayments();

    const market = toggle('Mercado');
    expect(market.getAttribute('aria-expanded')).toBe('false');
    expect(market.textContent).toMatch(/1\.200\.000/);
    expect(screen.queryByText('Costos variables · Alimentación')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Registrar otro')).toBeNull();
  });

  it('keeps an overdue one marked while closed', () => {
    renderPayments();

    expect(within(toggle('Alquiler')).getByRole('img', { name: 'Vencido' })).toBeDefined();
    expect(within(toggle('Mercado')).queryByRole('img', { name: 'Vencido' })).toBeNull();
  });

  it('unfolds into where it goes, when it is due and «Registrar pago», which opens it pre-filled', () => {
    const onSelect = renderPayments();

    fireEvent.click(toggle('Alquiler'));
    const details = document.getElementById(toggle('Alquiler').getAttribute('aria-controls')!)!;
    expect(within(details).getByText('Costos fijos › Vivienda')).toBeDefined();
    expect(within(details).getByText('Vence')).toBeDefined();
    expect(within(details).queryByText('Pagado')).toBeNull();

    fireEvent.click(within(details).getByRole('button', { name: 'Registrar pago' }));
    expect(onSelect).toHaveBeenCalledWith(RENT);
  });

  it('tells what was paid of one in installments as a plain fact, with the same single action', () => {
    const onSelect = renderPayments();

    fireEvent.click(toggle('Mercado'));
    const details = document.getElementById(toggle('Mercado').getAttribute('aria-controls')!)!;
    expect(within(details).getByText('Pagado')).toBeDefined();
    expect(within(details).getByText(/320\.450 de .*1\.200\.000/)).toBeDefined();
    expect(screen.queryByRole('progressbar')).toBeNull();

    fireEvent.click(within(details).getByRole('button', { name: 'Registrar pago' }));
    expect(onSelect).toHaveBeenCalledWith(MARKET);
  });

  it('keeps one open at a time', () => {
    renderPayments();

    fireEvent.click(toggle('Mercado'));
    fireEvent.click(toggle('Alquiler'));
    expect(toggle('Mercado').getAttribute('aria-expanded')).toBe('false');
    expect(toggle('Alquiler').getAttribute('aria-expanded')).toBe('true');
  });
});
