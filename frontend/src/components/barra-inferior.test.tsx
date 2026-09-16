// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { LayoutDashboard, ScanLine, Wallet } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarraInferior } from './barra-inferior';
import type { Seccion } from './navegacion';

afterEach(cleanup);

const RESUMEN: Seccion = { to: '/', label: 'Resumen', Icono: LayoutDashboard, exact: true };
const CUENTAS: Seccion = { to: '/cuentas', label: 'Cuentas', Icono: Wallet, exact: false };
const ESCANEAR: Seccion = { to: '/escanear', label: 'Escanear', Icono: ScanLine, exact: false };

function pintar(izquierda: Seccion[], derecha: Seccion[]) {
  return render(
    <MemoryRouter>
      <BarraInferior izquierda={izquierda} derecha={derecha} nombre="Gerardo" onAtajos={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('La barra de abajo', () => {
  it('nunca pasa de cinco huecos', () => {
    const { container } = pintar([RESUMEN, CUENTAS], [ESCANEAR]);
    // Cuatro enlaces —tres secciones y la cuenta— más el botón del centro.
    expect(container.querySelectorAll('a')).toHaveLength(4);
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('cada hueco lleva su nombre, y ninguno lo escribe debajo', () => {
    pintar([RESUMEN, CUENTAS], [ESCANEAR]);

    for (const nombre of ['Resumen', 'Cuentas', 'Escanear', 'Mi cuenta', 'Atajos']) {
      expect(screen.getByLabelText(nombre)).toBeTruthy();
    }

    // Cinco palabras de 12px bajo cinco dibujos son una segunda fila de texto
    // compitiendo con la página.
    expect(screen.queryByText('Resumen')).toBeNull();
    expect(screen.queryByText('Escanear')).toBeNull();
  });

  it('se aparta sola cuando se abre el menú: el armazón la reconoce', () => {
    const { container } = pintar([RESUMEN], [ESCANEAR]);
    // La regla de `:has()` de index.css apunta a esto. Sin la marca, la barra
    // se queda debajo de un panel a pantalla completa.
    expect(container.querySelector('[data-armazon="barra"]')).toBeTruthy();
  });

  it('el botón del centro no es un destino', () => {
    const alPulsar = vi.fn();
    render(
      <MemoryRouter>
        <BarraInferior izquierda={[RESUMEN]} derecha={[ESCANEAR]} nombre="G" onAtajos={alPulsar} />
      </MemoryRouter>,
    );

    const boton = screen.getByLabelText('Atajos');
    expect(boton.tagName).toBe('BUTTON');
    boton.click();
    expect(alPulsar).toHaveBeenCalled();
  });
});
