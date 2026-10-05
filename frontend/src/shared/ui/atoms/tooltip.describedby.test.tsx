// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ConTooltip } from './tooltip';

/**
 * La pista se ANUNCIA, no solo se ve: el ancla la nombra con
 * `aria-describedby`, y la referencia vale antes de que aparezca, que es justo
 * cuando un lector de pantalla llega al ancla.
 */
afterEach(cleanup);

function anchor(): HTMLElement {
  render(
    <ConTooltip texto="Pagado con tarjeta">
      <span>icono</span>
    </ConTooltip>,
  );
  return screen.getByText('icono').parentElement!;
}

describe('ConTooltip y el lector de pantalla', () => {
  it('el ancla apunta a la pista desde antes de enseñarla', () => {
    const ancla = anchor();
    const id = ancla.getAttribute('aria-describedby');

    expect(id).toBeTruthy();
    const pista = document.getElementById(id!);
    expect(pista?.getAttribute('role')).toBe('tooltip');
    expect(pista?.textContent).toBe('Pagado con tarjeta');
  });

  it('se describe con el texto de la pista al enfocarla', () => {
    const ancla = anchor();

    fireEvent.focus(ancla);

    expect(screen.getByRole('tooltip').id).toBe(ancla.getAttribute('aria-describedby'));
  });
});
