// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './app-shell';
import { CONSULTA_MOVIL } from './movil';
import { olvidarAtajos } from '@/lib/atajos';

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    usuario: { display_name: 'Gerardo', email: 'g@coco.app' },
    esAdmin: false,
    salir: vi.fn(),
  }),
}));

vi.mock('@/lib/preferences', () => ({ useLlevaCuentas: () => true }));

/** jsdom no evalúa consultas de medios: se le dice la respuesta. */
function alAncho(esMovil: boolean): void {
  window.matchMedia = ((consulta: string) => ({
    matches: consulta === CONSULTA_MOVIL ? esMovil : !esMovil,
    media: consulta,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/**
 * La ficha del (+) consulta las categorías nada más abrirse, así que el
 * armazón necesita un cliente. Sin red: lo que se comprueba es que la ficha
 * ESTÁ, no lo que trae dentro.
 */
function pintar() {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => Promise.resolve({ data: [] }) } },
  });

  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<p>la página</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(olvidarAtajos);
afterEach(cleanup);

describe('El armazón por debajo del corte', () => {
  beforeEach(() => alAncho(true));

  it('el riel no se esconde: no está', () => {
    const { container } = pintar();
    // Escondido con CSS seguiría siendo nueve enlaces en el orden de
    // tabulación y dos veces cada nombre en la página.
    expect(container.querySelector('aside')).toBeNull();
  });

  it('salen el techo y la barra, y el cuerpo se reserva su hueco', () => {
    const { container } = pintar();

    expect(container.querySelector('[data-armazon="techo"]')).toBeTruthy();
    expect(document.querySelector('[data-armazon="barra"]')).toBeTruthy();

    const cuerpo = container.querySelector('main')!;
    expect(cuerpo.className).toContain('movil:pb-[var(--hueco-de-la-barra)]');
    // Recorta, no ofrece: `auto` convertiría la página entera en un
    // desplazamiento lateral indistinguible del del documento.
    expect(cuerpo.className).toContain('movil:overflow-x-clip');
  });

  it('las tres hojas están montadas desde el principio, cerradas', () => {
    pintar();

    // Lo que se desliza no se puede reconstruir en cada render: aparecería en
    // vez de llegar. Atajos, buscar y la cuenta.
    const hojas = document.querySelectorAll('[data-superficie="panel"]');
    expect(hojas.length).toBeGreaterThanOrEqual(3);
    for (const hoja of hojas) {
      expect(hoja.getAttribute('data-abierta')).toBe('no');
    }
  });

  it('el techo lleva la marca y nada más: no hay hamburguesa', () => {
    const { container } = pintar();
    const techo = container.querySelector('[data-armazon="techo"]')!;

    // El menú a pantalla completa era la cuarta forma de llegar a las mismas
    // páginas. Lo del día a día está en la barra, cualquier página en los
    // atajos y lo de administrar en la hoja del avatar.
    expect(techo.querySelector('[aria-label="Abrir el menú"]')).toBeNull();
    expect(techo.querySelector('button')).toBeNull();
    expect(techo.querySelector('svg')).toBeTruthy();
  });

  it('el (+) de la barra abre la ficha de un movimiento nuevo', () => {
    pintar();

    expect(document.querySelector('[aria-label="Nuevo movimiento"]')).toBeNull();
    act(() => {
      (document.querySelector('[aria-label="Registrar un gasto"]') as HTMLElement).click();
    });
    expect(document.querySelector('[aria-label="Nuevo movimiento"]')).toBeTruthy();
  });
});

describe('El armazón por encima del corte', () => {
  beforeEach(() => alAncho(false));

  it('vuelve el riel y no hay nada del teléfono', () => {
    const { container } = pintar();

    expect(container.querySelector('aside')).toBeTruthy();
    expect(container.querySelector('[data-armazon="techo"]')).toBeNull();
    expect(document.querySelector('[data-armazon="barra"]')).toBeNull();
    // Y ninguna hoja: en el escritorio el riel lleva lo que ellas llevan.
    expect(document.querySelector('[data-superficie="panel"]')).toBeNull();
  });
});
