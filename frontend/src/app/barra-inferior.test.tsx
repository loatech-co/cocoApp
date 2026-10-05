// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarraInferior } from './barra-inferior';

afterEach(cleanup);

function pintar(extra: Partial<Parameters<typeof BarraInferior>[0]> = {}) {
  const manos = {
    onBuscar: vi.fn(),
    onNuevoGasto: vi.fn(),
    onAtajos: vi.fn(),
    onCuenta: vi.fn(),
  };

  const vista = render(
    <MemoryRouter>
      <BarraInferior
        nombre="Gerardo"
        busquedaAbierta={false}
        atajosAbiertos={false}
        cuentaAbierta={false}
        {...manos}
        {...extra}
      />
    </MemoryRouter>,
  );

  return { ...vista, ...manos };
}

describe('La barra de abajo', () => {
  it('nunca pasa de cinco huecos', () => {
    const { container } = pintar();

    // Uno solo lleva a una página. Los otros cuatro levantan algo encima de
    // la que ya está debajo, así que son botones.
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelectorAll('button')).toHaveLength(4);
  });

  it('cada hueco lleva su nombre, y ninguno lo escribe debajo', () => {
    pintar();

    for (const nombre of ['Dashboard', 'Buscar', 'Registrar un gasto', 'Atajos', 'Mi cuenta']) {
      expect(screen.getByLabelText(nombre)).toBeTruthy();
    }

    // Cinco palabras de 12px bajo cinco dibujos son una segunda fila de texto
    // compitiendo con la página.
    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(screen.queryByText('Atajos')).toBeNull();
  });

  it('el armazón la reconoce', () => {
    const { container } = pintar();
    // La regla de `:has()` de index.css apunta a esto.
    expect(container.querySelector('[data-armazon="barra"]')).toBeTruthy();
  });

  it('el (+) registra un gasto sin pasar por ningún menú', () => {
    const { onNuevoGasto } = pintar();

    const boton = screen.getByLabelText('Registrar un gasto');
    expect(boton.tagName).toBe('BUTTON');
    boton.click();

    // Una sola llamada, no un menú que abrir: el ingreso todavía no existe, y
    // elegir entre una opción no es elegir.
    expect(onNuevoGasto).toHaveBeenCalledTimes(1);
  });

  it('buscar, atajos y la cuenta levantan una hoja: no navegan', () => {
    const { onBuscar, onAtajos, onCuenta } = pintar();

    screen.getByLabelText('Buscar').click();
    screen.getByLabelText('Atajos').click();
    screen.getByLabelText('Mi cuenta').click();

    expect(onBuscar).toHaveBeenCalled();
    expect(onAtajos).toHaveBeenCalled();
    expect(onCuenta).toHaveBeenCalled();
  });

  it('el hueco de lo que está abierto se anuncia desplegado', () => {
    pintar({ atajosAbiertos: true });

    expect(screen.getByLabelText('Atajos').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Buscar').getAttribute('aria-expanded')).toBe('false');
  });
});
