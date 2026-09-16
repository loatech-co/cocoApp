// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
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

function pintar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<p>la página</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
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

  it('el menú y los atajos están montados desde el principio, cerrados', () => {
    pintar();

    const secciones = document.querySelector('[data-superficie="secciones"]');
    const panel = document.querySelector('[data-superficie="panel"]');

    expect(secciones?.getAttribute('data-abierta')).toBe('no');
    expect(panel?.getAttribute('data-abierta')).toBe('no');
  });

  it('el botón del menú vive en el techo, que es el borde por el que entra', () => {
    const { container } = pintar();
    const techo = container.querySelector('[data-armazon="techo"]')!;
    expect(techo.querySelector('[aria-label="Abrir el menú"]')).toBeTruthy();
    // Y no en la barra: cuando el panel se abre, la barra se retira.
    const barra = document.querySelector('[data-armazon="barra"]')!;
    expect(barra.querySelector('[aria-label="Abrir el menú"]')).toBeNull();
  });
});

describe('El armazón por encima del corte', () => {
  beforeEach(() => alAncho(false));

  it('vuelve el riel y no hay nada del teléfono', () => {
    const { container } = pintar();

    expect(container.querySelector('aside')).toBeTruthy();
    expect(container.querySelector('[data-armazon="techo"]')).toBeNull();
    expect(document.querySelector('[data-armazon="barra"]')).toBeNull();
    // Una barra por documento: en el escritorio, ninguna.
    expect(document.querySelector('[data-superficie="secciones"]')).toBeNull();
  });
});
