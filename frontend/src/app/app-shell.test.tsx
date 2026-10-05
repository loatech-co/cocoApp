// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './app-shell';
import { CONSULTA_MOVIL } from './movil';
import { olvidarAtajos } from '@/lib/atajos';
import { fingirLaApp, salirDeLaApp } from '@/pruebas/app-falsa';

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
            <Route path="centros-de-costos" element={<p>los centros</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(olvidarAtajos);
afterEach(() => {
  cleanup();
  salirDeLaApp();
});

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

describe('El armazón embebido en la app', () => {
  // La app corre en un teléfono casi siempre, pero el modo embebido no
  // depende del ancho: en una tableta tampoco hay riel.
  beforeEach(() => {
    alAncho(true);
    fingirLaApp();
  });

  it('no monta el techo, ni la barra, ni la hoja de atajos ni la de la cuenta', () => {
    const { container } = pintar();

    // La barra nativa y la pestaña «Más» hacen ese papel. No se esconden con
    // CSS: una barra fija escondida sigue ocupando el orden de tabulación.
    expect(container.querySelector('[data-armazon="techo"]')).toBeNull();
    expect(document.querySelector('[data-armazon="barra"]')).toBeNull();
    expect(document.querySelector('[aria-label="Registrar un gasto"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Atajos');
    expect(container.querySelector('aside')).toBeNull();
  });

  it('sí monta la búsqueda, y window.__coco.abrirBusqueda() la abre', () => {
    pintar();

    const hojas = document.querySelectorAll('[data-superficie="panel"]');
    // Solo una: la búsqueda. Atajos y cuenta no están.
    expect(hojas.length).toBe(1);
    expect(hojas[0]!.getAttribute('data-abierta')).toBe('no');

    act(() => window.__coco!.abrirBusqueda());
    expect(hojas[0]!.getAttribute('data-abierta')).toBe('si');
  });

  it('window.__coco.ir() cambia la página sin recargar', () => {
    const { container } = pintar();
    expect(container.textContent).toContain('la página');

    act(() => window.__coco!.ir('/centros-de-costos'));

    expect(container.textContent).toContain('los centros');
    expect(container.textContent).not.toContain('la página');
  });

  it('en una tableta tampoco hay riel', () => {
    alAncho(false);
    const { container } = pintar();
    expect(container.querySelector('aside')).toBeNull();
    expect(window.__coco).toBeDefined();
  });
});

describe('Fuera de la app no se instala el puente', () => {
  beforeEach(() => alAncho(true));

  it('window.__coco no existe', () => {
    pintar();
    expect(window.__coco).toBeUndefined();
  });
});
