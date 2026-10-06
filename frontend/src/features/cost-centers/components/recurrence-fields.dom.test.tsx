// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CamposDeRecurrencia, type Recurrencia } from './recurrence-fields';

/**
 * «Pago automático» y «se paga en varias veces» no pueden convivir.
 *
 * Y la regla se enseña AQUÍ, no solo en el servidor. Dejar los dos
 * encendibles para que la API conteste 422 es hacer que la regla se descubra
 * fallando, después de pulsar guardar.
 */
afterEach(cleanup);

const BASE: Recurrencia = {
  recurrente: true,
  periodicidad: 'monthly',
  diaDePago: 1,
  mesDePago: 1,
  presupuesto: '1200000',
  pagoAutomatico: false,
  variosPagos: false,
};

/** Con estado de verdad: lo que se prueba es cómo reacciona a lo que se pulsa. */
function Ficha({ inicial = BASE }: { inicial?: Recurrencia }) {
  const [valor, setValor] = useState(inicial);
  return <CamposDeRecurrencia valor={valor} onCambiar={setValor} concepto="Mercado" />;
}

const interruptorDe = (nombre: RegExp) =>
  screen.getByText(nombre).closest('label')!.querySelector('input')!;

describe('Las dos formas de saldar un concepto', () => {
  it('con las dos apagadas, cualquiera se puede encender', () => {
    render(<Ficha />);

    expect(interruptorDe(/^Pago automático$/).disabled).toBe(false);
    expect(interruptorDe(/^Se paga en varias veces$/).disabled).toBe(false);
  });

  it('encendido el pago automático, el otro se apaga y DICE por qué', () => {
    render(<Ficha />);
    fireEvent.click(interruptorDe(/^Pago automático$/));

    expect(interruptorDe(/^Se paga en varias veces$/).disabled).toBe(true);
    expect(screen.getByText(/No se puede junto al pago automático/i)).toBeDefined();
  });

  it('y al revés', () => {
    render(<Ficha />);
    fireEvent.click(interruptorDe(/^Se paga en varias veces$/));

    expect(interruptorDe(/^Pago automático$/).disabled).toBe(true);
  });

  it('apagar el que estaba encendido vuelve a liberar al otro', () => {
    // Sin esto los dos quedarían trabados para siempre en cuanto se tocara
    // uno, que es peor que no tener la regla.
    render(<Ficha />);
    const automatico = interruptorDe(/^Pago automático$/);

    fireEvent.click(automatico);
    expect(interruptorDe(/^Se paga en varias veces$/).disabled).toBe(true);

    fireEvent.click(automatico);
    expect(interruptorDe(/^Se paga en varias veces$/).disabled).toBe(false);
  });

  it('encender uno NO apaga el otro a escondidas', () => {
    // Apagar solo el ajuste de alguien sería cambiarle algo que no tocó. Lo
    // que se hace es impedirlo y explicarlo, no corregirlo por su cuenta.
    render(<Ficha />);
    fireEvent.click(interruptorDe(/^Se paga en varias veces$/));

    expect(interruptorDe(/^Se paga en varias veces$/).checked).toBe(true);
    expect(interruptorDe(/^Pago automático$/).checked).toBe(false);
  });
});

describe('Lo que dice el interruptor de varias veces', () => {
  it('con presupuesto, habla del presupuesto', () => {
    render(<Ficha />);
    expect(screen.getByText(/hasta cubrir el presupuesto/i)).toBeDefined();
  });

  it('sin presupuesto, dice que se mide contra el promedio', () => {
    // Que no haya presupuesto no lo deshabilita: hay una cifra igual, solo
    // que estimada. Pero tiene que decir CUÁL, o el progreso se compara
    // contra un número que nadie escribió.
    render(<Ficha inicial={{ ...BASE, presupuesto: '' }} />);
    expect(screen.getByText(/hasta cubrir el promedio de los meses anteriores/i)).toBeDefined();
  });

  it('y nada de esto aparece si el concepto no es recurrente', () => {
    render(<Ficha inicial={{ ...BASE, recurrente: false }} />);
    expect(screen.queryByText(/^Se paga en varias veces$/)).toBeNull();
  });
});
