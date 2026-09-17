// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keys, type CategoryTree } from '@/lib/queries';
import { MovimientoModal } from './movimiento-modal';

/*
  La red, de mentira.

  `ApiClientError` se reexporta DE VERDAD —no una copia— porque la ficha
  decide qué mensaje enseñar con un `instanceof`: una clase paralela con el
  mismo nombre no coincidiría, y la prueba pasaría por el camino equivocado
  sin que se notara.
*/
const { ApiClientError } = await vi.importActual<typeof import('@/lib/api-client')>(
  '@/lib/api-client',
);

const apiFetch = vi.fn();
const apiSubir = vi.fn();

vi.mock('@/lib/api-client', async () => {
  const real = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...real,
    apiFetch: (...args: unknown[]) => apiFetch(...args),
    apiSubir: (...args: unknown[]) => apiSubir(...args),
  };
});

vi.mock('./leer-soporte', () => ({ leerSoporte: vi.fn() }));

const ARBOL = [
  {
    id: 1,
    name: 'Costos fijos',
    kind: 'expense',
    estatico: false,
    children: [
      {
        id: 10,
        name: 'Servicios públicos',
        kind: 'expense',
        children: [{ id: 100, name: 'Celsia (Energía)', kind: 'expense', children: [] }],
      },
    ],
  },
] as unknown as CategoryTree[];

beforeEach(() => {
  apiFetch.mockReset();
  apiSubir.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:prueba');
  URL.revokeObjectURL = vi.fn();
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function abrirFichaNueva() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  cliente.setQueryData([...keys.categories, 'todas'], ARBOL);

  const vista = render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter>
        <MovimientoModal abierta movimiento={null} onCerrar={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // La ficha nueva abre por el «cómo empezar»; el formulario está detrás.
  fireEvent.click(screen.getByText('Registrar manualmente'));
  return vista;
}

/** Adjunta un archivo por el campo de verdad, que va escondido. */
async function adjuntar(container: HTMLElement): Promise<void> {
  const campo = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(campo).not.toBeNull();

  const archivo = new File([new Uint8Array(64)], 'captura.png', { type: 'image/png' });
  Object.defineProperty(campo, 'files', { value: [archivo], configurable: true });

  await act(async () => {
    fireEvent.change(campo);
  });
}

async function registrar(): Promise<void> {
  const valor = document.getElementById('mov-valor') as HTMLInputElement;
  fireEvent.change(valor, { target: { value: '120000' } });

  await act(async () => {
    fireEvent.submit(valor.closest('form')!);
  });
}

const llamadas = () => apiFetch.mock.calls.map(([ruta, opciones]) => [ruta, opciones?.method]);

/**
 * La red contesta por RUTA, no una cosa para todo.
 *
 * La ficha consulta el árbol de categorías nada más abrirse, y una respuesta
 * única le devolvía el `{ id }` de un movimiento donde esperaba una lista:
 * reventaba pintando los desplegables, antes de llegar a lo que se prueba.
 */
function responder({ alBorrar }: { alBorrar: () => Promise<unknown> }): void {
  apiFetch.mockImplementation((ruta: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'DELETE') return alBorrar();
    if (ruta.startsWith('/categories')) return Promise.resolve({ data: ARBOL });
    return Promise.resolve({ data: { id: 42 } });
  });
}

/**
 * Un movimiento no se guarda sin el soporte que se le adjuntó.
 *
 * Registrar son DOS peticiones —el movimiento y después sus soportes— y la
 * segunda puede fallar sola. Antes el movimiento se quedaba: había plata
 * anotada sin el papel que la explica, y nada en la pantalla recordaba que
 * faltaba. Ahora se deshace.
 */
describe('Cuando el soporte falla al registrar', () => {
  it('borra el movimiento que se acababa de crear', async () => {
    responder({ alBorrar: () => Promise.resolve({ data: undefined }) });
    apiSubir.mockRejectedValue(
      new ApiClientError(503, 'service_unavailable', 'Al servidor se le acabaron los recursos.'),
    );

    const { container } = abrirFichaNueva();
    await adjuntar(container);
    await registrar();

    // Se creó, falló el soporte, y lo creado se fue.
    expect(apiSubir).toHaveBeenCalledOnce();
    expect(llamadas()).toContainEqual(['/transactions/42', 'DELETE']);

    // Y se dice sin rodeos: no quedó nada. Quien lea otra cosa se va a quedar
    // buscando en la tabla un movimiento que no existe.
    expect(screen.getByText(/No quedó registrado nada/)).toBeDefined();
  });

  it('si tampoco se pudo deshacer, lo dice y no duplica al reintentar', async () => {
    responder({ alBorrar: () => Promise.reject(new Error('sin conexión')) });
    apiSubir.mockRejectedValue(new ApiClientError(503, 'service_unavailable', 'Falló el soporte.'));

    const { container } = abrirFichaNueva();
    await adjuntar(container);
    await registrar();

    expect(screen.getByText(/quedó registrado/)).toBeDefined();

    // El reintento ACTUALIZA el 42 en vez de crear un segundo movimiento por
    // la misma plata: es el caso que obligaba a recordar el id.
    apiFetch.mockClear();
    await registrar();

    expect(llamadas()).toContainEqual(['/transactions/42', 'PATCH']);
    expect(llamadas().some(([ruta, metodo]) => ruta === '/transactions' && metodo === 'POST')).toBe(
      false,
    );
  });
});
