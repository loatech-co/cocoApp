// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { RecurrenceFields, type Recurrence } from './recurrence-fields';

/**
 * «Pago automático» y «se paga en varias veces» no pueden convivir.
 *
 * Y la regla se enseña AQUÍ, no solo en el servidor. Dejar los dos
 * encendibles para que la API conteste 422 es hacer que la regla se descubra
 * fallando, después de pulsar guardar.
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

/** Con estado de verdad: lo que se prueba es cómo reacciona a lo que se pulsa. */
function Harness({ initial = BASE }: { initial?: Recurrence }) {
  const [value, setValue] = useState(initial);
  return <RecurrenceFields value={value} onChange={setValue} concept="Mercado" />;
}

const switchFor = (name: RegExp) =>
  screen.getByText(name).closest('label')!.querySelector('input')!;

describe('Las dos formas de saldar un concepto', () => {
  it('con las dos apagadas, cualquiera se puede encender', () => {
    render(<Harness />);

    expect(switchFor(/^Pago automático$/).disabled).toBe(false);
    expect(switchFor(/^Se paga en varias veces$/).disabled).toBe(false);
  });

  it('encendido el pago automático, el otro se apaga y DICE por qué', () => {
    render(<Harness />);
    fireEvent.click(switchFor(/^Pago automático$/));

    expect(switchFor(/^Se paga en varias veces$/).disabled).toBe(true);
    expect(screen.getByText(/No se puede junto al pago automático/i)).toBeDefined();
  });

  it('y al revés', () => {
    render(<Harness />);
    fireEvent.click(switchFor(/^Se paga en varias veces$/));

    expect(switchFor(/^Pago automático$/).disabled).toBe(true);
  });

  it('apagar el que estaba encendido vuelve a liberar al otro', () => {
    // Sin esto los dos quedarían trabados para siempre en cuanto se tocara
    // uno, que es peor que no tener la regla.
    render(<Harness />);
    const autoPaySwitch = switchFor(/^Pago automático$/);

    fireEvent.click(autoPaySwitch);
    expect(switchFor(/^Se paga en varias veces$/).disabled).toBe(true);

    fireEvent.click(autoPaySwitch);
    expect(switchFor(/^Se paga en varias veces$/).disabled).toBe(false);
  });

  it('encender uno NO apaga el otro a escondidas', () => {
    // Apagar solo el ajuste de alguien sería cambiarle algo que no tocó. Lo
    // que se hace es impedirlo y explicarlo, no corregirlo por su cuenta.
    render(<Harness />);
    fireEvent.click(switchFor(/^Se paga en varias veces$/));

    expect(switchFor(/^Se paga en varias veces$/).checked).toBe(true);
    expect(switchFor(/^Pago automático$/).checked).toBe(false);
  });
});

describe('Lo que dice el interruptor de varias veces', () => {
  it('con presupuesto, habla del presupuesto', () => {
    render(<Harness />);
    expect(screen.getByText(/hasta cubrir el presupuesto/i)).toBeDefined();
  });

  it('sin presupuesto, dice que se mide contra el promedio', () => {
    // Que no haya presupuesto no lo deshabilita: hay una cifra igual, solo
    // que estimada. Pero tiene que decir CUÁL, o el progreso se compara
    // contra un número que nadie escribió.
    render(<Harness initial={{ ...BASE, budget: '' }} />);
    expect(screen.getByText(/hasta cubrir el promedio de los meses anteriores/i)).toBeDefined();
  });

  it('y nada de esto aparece si el concepto no es recurrente', () => {
    render(<Harness initial={{ ...BASE, isRecurring: false }} />);
    expect(screen.queryByText(/^Se paga en varias veces$/)).toBeNull();
  });
});
