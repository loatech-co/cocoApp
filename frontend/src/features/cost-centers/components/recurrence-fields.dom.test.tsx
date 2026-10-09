// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { RecurrenceFields, type Recurrence } from './recurrence-fields';

/**
 * «Pago automático» and «se paga en varias veces» cannot coexist.
 *
 * And the rule is taught HERE, not only on the server. Leaving both
 * switchable so that the API answers 422 is making the rule be discovered
 * by failing, after pressing save.
 */
afterEach(cleanup);

const BASE: Recurrence = {
  isRecurring: true,
  periodicity: 'monthly',
  paymentDay: 1,
  paymentMonth: 1,
  budget: '1200000',
  isAutoPay: false,
  isMultiPayment: false,
};

/** With real state: what is tested is how it reacts to what is pressed. */
function Harness({ initial = BASE }: { initial?: Recurrence }) {
  const [value, setValue] = useState(initial);
  return <RecurrenceFields value={value} onChange={setValue} concept="Mercado" />;
}

const switchFor = (name: RegExp) =>
  screen.getByText(name).closest('label')!.querySelector('input')!;

describe('The two ways of settling a concept', () => {
  it('with both off, either one can be switched on', () => {
    render(<Harness />);

    expect(switchFor(/^Pago automático$/).disabled).toBe(false);
    expect(switchFor(/^Se paga en varias veces$/).disabled).toBe(false);
  });

  it('with automatic payment on, the other one turns off and SAYS why', () => {
    render(<Harness />);
    fireEvent.click(switchFor(/^Pago automático$/));

    expect(switchFor(/^Se paga en varias veces$/).disabled).toBe(true);
    expect(screen.getByText(/No se puede junto al pago automático/i)).toBeDefined();
  });

  it('and the other way around', () => {
    render(<Harness />);
    fireEvent.click(switchFor(/^Se paga en varias veces$/));

    expect(switchFor(/^Pago automático$/).disabled).toBe(true);
  });

  it('switching off the one that was on frees the other again', () => {
    // Without this both would be stuck forever as soon as one was touched,
    // which is worse than not having the rule.
    render(<Harness />);
    const autoPaySwitch = switchFor(/^Pago automático$/);

    fireEvent.click(autoPaySwitch);
    expect(switchFor(/^Se paga en varias veces$/).disabled).toBe(true);

    fireEvent.click(autoPaySwitch);
    expect(switchFor(/^Se paga en varias veces$/).disabled).toBe(false);
  });

  it('switching one on does NOT switch the other off behind the scenes', () => {
    // Switching off someone's setting on its own would be changing something they did not touch. What
    // is done is to prevent it and explain it, not to correct it on one's own.
    render(<Harness />);
    fireEvent.click(switchFor(/^Se paga en varias veces$/));

    expect(switchFor(/^Se paga en varias veces$/).checked).toBe(true);
    expect(switchFor(/^Pago automático$/).checked).toBe(false);
  });
});

describe('What the several-payments switch says', () => {
  it('with a budget, it talks about the budget', () => {
    render(<Harness />);
    expect(screen.getByText(/hasta cubrir el presupuesto/i)).toBeDefined();
  });

  it('without a budget, it says it is measured against the average', () => {
    // Having no budget does not disable it: there is a figure all the same, just
    // estimated. But it has to say WHICH one, or the progress is compared
    // against a number nobody wrote.
    render(<Harness initial={{ ...BASE, budget: '' }} />);
    expect(screen.getByText(/hasta cubrir el promedio de los meses anteriores/i)).toBeDefined();
  });

  it('and none of this shows up if the concept is not recurring', () => {
    render(<Harness initial={{ ...BASE, isRecurring: false }} />);
    expect(screen.queryByText(/^Se paga en varias veces$/)).toBeNull();
  });
});
