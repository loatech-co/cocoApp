// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TrendingDown } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MenuOpcionDetallada } from './menu-rich-option';

afterEach(cleanup);

describe('MenuOpcionDetallada', () => {
  it('reads its title and help, and is chosen with a click', () => {
    const onClick = vi.fn();
    render(
      <MenuOpcionDetallada
        Icono={TrendingDown}
        color="gasto"
        titulo="Gasto"
        ayuda="Plata que sale"
        onClick={onClick}
      />,
    );

    const opcion = screen.getByRole('menuitem');
    expect(opcion.textContent).toContain('Plata que sale');
    fireEvent.click(opcion);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows why it is off, and cannot be chosen', () => {
    render(
      <MenuOpcionDetallada
        Icono={TrendingDown}
        color="ingreso"
        titulo="Ingreso"
        ayuda="Plata que entra"
        nota="Pronto"
        deshabilitada
      />,
    );

    const opcion = screen.getByRole('menuitem');
    expect(opcion).toHaveProperty('disabled', true);
    expect(opcion.textContent).toContain('Pronto');
  });
});
