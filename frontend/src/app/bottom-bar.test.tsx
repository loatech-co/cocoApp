// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BottomBar } from './bottom-bar';

afterEach(cleanup);

function renderShell(extra: Partial<Parameters<typeof BottomBar>[0]> = {}) {
  const handlers = {
    onSearch: vi.fn(),
    onNewExpense: vi.fn(),
    onShortcuts: vi.fn(),
    onAccount: vi.fn(),
  };

  const vista = render(
    <MemoryRouter>
      <BottomBar
        name="Gerardo"
        isSearchOpen={false}
        isShortcutsOpen={false}
        isAccountOpen={false}
        {...handlers}
        {...extra}
      />
    </MemoryRouter>,
  );

  return { ...vista, ...handlers };
}

describe('La barra de abajo', () => {
  it('nunca pasa de cinco huecos', () => {
    const { container } = renderShell();

    // Uno solo lleva a una página. Los otros cuatro levantan algo encima de
    // la que ya está debajo, así que son botones.
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelectorAll('button')).toHaveLength(4);
  });

  it('cada hueco lleva su nombre, y ninguno lo escribe debajo', () => {
    renderShell();

    for (const name of ['Dashboard', 'Buscar', 'Registrar un gasto', 'Atajos', 'Mi cuenta']) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }

    // Cinco palabras de 12px bajo cinco dibujos son una segunda fila de texto
    // compitiendo con la página.
    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(screen.queryByText('Atajos')).toBeNull();
  });

  it('el armazón la reconoce', () => {
    const { container } = renderShell();
    // La regla de `:has()` de index.css apunta a esto.
    expect(container.querySelector('[data-armazon="barra"]')).toBeTruthy();
  });

  it('el (+) registra un gasto sin pasar por ningún menú', () => {
    const { onNewExpense } = renderShell();

    const button = screen.getByLabelText('Registrar un gasto');
    expect(button.tagName).toBe('BUTTON');
    button.click();

    // Una sola llamada, no un menú que abrir: el ingreso todavía no existe, y
    // elegir entre una opción no es elegir.
    expect(onNewExpense).toHaveBeenCalledTimes(1);
  });

  it('buscar, atajos y la cuenta levantan una hoja: no navegan', () => {
    const { onSearch, onShortcuts, onAccount } = renderShell();

    screen.getByLabelText('Buscar').click();
    screen.getByLabelText('Atajos').click();
    screen.getByLabelText('Mi cuenta').click();

    expect(onSearch).toHaveBeenCalled();
    expect(onShortcuts).toHaveBeenCalled();
    expect(onAccount).toHaveBeenCalled();
  });

  it('el hueco de lo que está abierto se anuncia desplegado', () => {
    renderShell({ isShortcutsOpen: true });

    expect(screen.getByLabelText('Atajos').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Buscar').getAttribute('aria-expanded')).toBe('false');
  });
});
