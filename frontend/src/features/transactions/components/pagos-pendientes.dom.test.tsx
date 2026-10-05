// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type PendingPayment } from '@/shared/api/generated/model';

import { PagosPendientes } from './pagos-pendientes';

/**
 * Un concepto que se cubre a pedazos no es «sin pagar».
 *
 * El fallo que esto vigila: al primer movimiento, «Mercado» desaparecía de la
 * lista y el resto del mes la única pantalla que responde «¿qué me falta
 * pagar?» contestaba que nada, con 320.450 pagados de 1.200.000. Ahora se
 * queda, pero entonces aparece el fallo contrario: quedarse SIN decir que ya
 * lleva algo se lee como si no se hubiera pagado nada.
 */
afterEach(cleanup);

const BASE = {
  path: 'Costos variables · Alimentación',
  periodicity: 'monthly',
  dueDate: '2999-12-01',
  costCenterId: 1,
  costCenter: 'Costos variables',
} as const;

const MERCADO = {
  ...BASE,
  categoryId: 10,
  name: 'Mercado',
  expectedAmount: '1200000',
  paidAmount: '320450',
  isMultiPayment: true,
} as unknown as PendingPayment;

const ALQUILER = {
  ...BASE,
  categoryId: 20,
  name: 'Alquiler',
  path: 'Costos fijos · Vivienda',
  expectedAmount: '2400000',
  paidAmount: '0',
  isMultiPayment: false,
} as unknown as PendingPayment;

function pintar(pagos: PendingPayment[], onElegir = vi.fn()) {
  render(<PagosPendientes pagos={pagos} onElegir={onElegir} />);
  return onElegir;
}

describe('Un pendiente que se paga en varias veces', () => {
  it('dice cuánto lleva, no solo cuánto cuesta', () => {
    pintar([MERCADO]);

    // El total sigue a la derecha, como en cualquier pendiente. Sale dos
    // veces —en la fila y en el rótulo de la tarjeta— y las dos son correctas.
    expect(screen.getAllByText(/1\.200\.000/).length).toBeGreaterThan(0);
    // Y lo que esta fila añade: dónde va.
    expect(screen.getByText(/Lleva.*320\.450/)).toBeDefined();
  });

  it('pinta una barra con la fracción cubierta, y la anuncia', () => {
    pintar([MERCADO]);

    const barra = screen.getByRole('progressbar');
    // 320450 / 1200000 = 26,7 % → 27.
    expect(barra.getAttribute('aria-valuenow')).toBe('27');
    // Sin nombre accesible, un div que crece no dice nada a quien no lo ve.
    expect(barra.getAttribute('aria-label')).toMatch(/Mercado/);
  });

  it('ofrece «Registrar otro» y no «confirmar»', () => {
    // Lo que va a pasar al pulsar es anotar ESTA ida, no dar el mes por
    // saldado. El rótulo tiene que decir eso.
    pintar([MERCADO]);
    expect(screen.getByText('Registrar otro')).toBeDefined();
  });

  it('al pulsarla, entrega el pago entero a quien abre la ficha', () => {
    const onElegir = pintar([MERCADO]);

    fireEvent.click(screen.getByText('Mercado'));

    expect(onElegir).toHaveBeenCalledWith(MERCADO);
  });
});

describe('Un pendiente normal no cambia', () => {
  it('no lleva barra ni «Registrar otro»', () => {
    pintar([ALQUILER]);

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Registrar otro')).toBeNull();
    expect(screen.queryByText(/Lleva/)).toBeNull();
  });

  it('y conviviendo con uno de varias veces, solo el otro la lleva', () => {
    // Que la barra se escape a las filas vecinas sería peor que no tenerla:
    // diría que un alquiler sin pagar está pagado a medias.
    pintar([MERCADO, ALQUILER]);

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });
});

describe('Sin un total al que llegar', () => {
  it('no se pinta barra, porque sería una fracción sin denominador', () => {
    // Ya es un `PendingPayment`: esparcirlo no cambia el tipo, así que no hay
    // nada que afirmar.
    const sinTotal: PendingPayment = { ...MERCADO, expectedAmount: null, paidAmount: '50000' };
    pintar([sinTotal]);

    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
