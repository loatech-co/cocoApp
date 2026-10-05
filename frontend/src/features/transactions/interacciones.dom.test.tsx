// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keys, type CategoryTree } from '@/lib/queries';
import { MovimientoModal } from './movimiento-modal';

/*
  Cuántas veces tiene que tocar la pantalla una persona para anotar un gasto.

  La fase 2 lo fija como meta —cinco interacciones o menos con clasificación
  completa, cuatro o menos cuando la sugerencia acierta— y hasta ahora el único
  número que había era una cuenta a mano en el registro. Esta prueba CUENTA:
  cada gesto de la persona pasa por `gesto()`, y lo que se afirma al final es
  el total. Si la ficha gana un paso, el número sube y la prueba lo dice; si
  pierde uno, también, para que se anote.

  Lo que NO cuenta como interacción: leer. Ver que la sugerencia ya está
  puesta no es un gesto. Y lo que SÍ cuenta aunque no esté en la lista de la
  fase: la pantalla de «cómo empezar» con la que abre una ficha nueva. Es un
  clic de verdad y la cuenta se da por los dos lados, desde la ficha abierta y
  desde el formulario.
*/

const apiFetch = vi.fn();
vi.mock('@/lib/api-client', async () => {
  const real = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...real, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

vi.mock('./leer-soporte', () => ({ leerSoporte: vi.fn() }));

/*
  La sugerencia del historial, de mentira y bajo control de cada prueba.

  La de verdad espera 400 ms y pregunta al servidor; aquí lo que se mide es
  cuántos gestos ahorra cuando ACIERTA, no cuándo llega. Devuelve siempre lo
  mismo porque, en una ficha a mano, la descripción de la que depende no se
  escribe —el campo libre se cambió por el buscador—: es la forma de poner una
  sugerencia encima del formulario sin pasar por un recibo.
*/
const sugerencia = vi.fn<() => { category_id: number; confidence: number; reason: 'historial' } | null>(
  () => null,
);
vi.mock('@/features/categorization/use-sugerencia', () => ({
  useSugerenciaDeCategoria: () => sugerencia(),
}));

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
        children: [
          { id: 100, name: 'Celsia (Energía)', kind: 'expense', palabras_clave: ['celsia'], children: [] },
          { id: 101, name: 'Acueducto', kind: 'expense', children: [] },
        ],
      },
    ],
  },
] as unknown as CategoryTree[];

/** El contador. Cada gesto de la persona pasa por aquí y por ningún otro sitio. */
let interacciones = 0;
function gesto(accion: () => void): void {
  interacciones += 1;
  accion();
}

beforeEach(() => {
  interacciones = 0;
  apiFetch.mockReset();
  sugerencia.mockReturnValue(null);
  // La red contesta por ruta: la ficha pide el árbol y los recientes nada más
  // abrirse, y una respuesta única le daría un `{ id }` donde espera listas.
  apiFetch.mockImplementation((ruta: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'POST' && ruta === '/transactions') return Promise.resolve({ data: { id: 42 } });
    if (ruta.startsWith('/categories')) return Promise.resolve({ data: ARBOL });
    if (ruta.startsWith('/transactions')) return Promise.resolve({ data: [], meta: {} });
    return Promise.resolve({ data: null, meta: {} });
  });
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(cleanup);

function abrirFichaNueva(): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  cliente.setQueryData([...keys.categories, 'todas'], ARBOL);

  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter>
        <MovimientoModal abierta movimiento={null} onCerrar={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Gesto 1 de toda ficha nueva: salir del «cómo empezar» hacia el formulario. */
const registrarManualmente = () => gesto(() => fireEvent.click(screen.getByText('Registrar manualmente')));

const escribirElMonto = () =>
  gesto(() => fireEvent.change(document.getElementById('mov-valor')!, { target: { value: '120000' } }));

async function guardar(): Promise<void> {
  // El `async` sin `await` es a propósito: `act` asíncrono vacía además la
  // cola de microtareas, donde se resuelven las peticiones que dispara el
  // envío. Con la versión síncrona se miraría la red de antes.
  // eslint-disable-next-line @typescript-eslint/require-await -- ver arriba
  await act(async () => {
    gesto(() => fireEvent.submit(document.getElementById('mov-valor')!.closest('form')!));
  });
}

/** Lo que se mandó a crear, para comprobar que fue CON clasificación. */
const cuerpoCreado = () =>
  apiFetch.mock.calls.find(([ruta, o]) => ruta === '/transactions' && o?.method === 'POST')?.[1]?.body as
    | { category_id: number | null; amount: unknown }
    | undefined;

const seAprendio = () => apiFetch.mock.calls.some(([ruta]) => ruta === '/categorization/learn');

describe('Registrar un gasto con clasificación completa', () => {
  it('a mano, por el buscador: seis gestos desde la ficha abierta, cinco desde el formulario', async () => {
    abrirFichaNueva();

    registrarManualmente(); // 1
    escribirElMonto(); // 2

    // El buscador es un botón que abre la caja de búsqueda: abrirlo es un
    // gesto, escribir es otro, elegir el resultado es el tercero.
    gesto(() => fireEvent.click(screen.getByRole('button', { name: /Concepto/ }))); // 3
    gesto(() =>
      fireEvent.change(screen.getByLabelText('Buscar concepto o categoría'), { target: { value: 'celsia' } }),
    ); // 4
    gesto(() => fireEvent.click(screen.getByRole('option', { name: /^Celsia/ }))); // 5

    await guardar(); // 6

    expect(cuerpoCreado()).toMatchObject({ category_id: 100 });
    // Nadie sugirió nada: clasificar a mano no es confirmar una sugerencia.
    expect(seAprendio()).toBe(false);

    /*
      El número real. La fase pedía ≤ 5 contando monto, búsqueda, elección y
      guardado —y esos son exactamente cinco—; el sexto es la pantalla de
      «cómo empezar», que la ficha nueva pone delante del formulario.
    */
    expect(interacciones).toBe(6);
  });

  it('con una sugerencia que acierta: tres gestos desde la ficha abierta, dos desde el formulario', async () => {
    sugerencia.mockReturnValue({ category_id: 100, confidence: 0.9, reason: 'historial' });
    abrirFichaNueva();

    registrarManualmente(); // 1
    escribirElMonto(); // 2

    // La sugerencia ya está puesta y dice de dónde salió. Mirarla no es un
    // gesto: la regla de no guardar nunca una clasificación sin que la
    // persona la VEA se cumple con tenerla delante, no con un clic más.
    expect(screen.getByRole('button', { name: /Concepto/ }).textContent).toContain('Celsia (Energía)');
    expect(screen.getByText(/Sugerido por tu historial/)).toBeDefined();

    await guardar(); // 3

    expect(cuerpoCreado()).toMatchObject({ category_id: 100 });

    /*
      Hubo sugerencia, pero no hay de qué aprender: la ficha a mano no tiene
      descripción —el campo libre se cambió por el buscador— y una regla
      sin texto no es una regla. `learn` solo se llama con descripción, y
      ese camino —el de un recibo leído— lo cubre la e2e de la API.
    */
    expect(seAprendio()).toBe(false);

    /*
      El número real, por debajo del ≤ 4 de la fase: monto y guardado desde
      el formulario, más el «cómo empezar».
    */
    expect(interacciones).toBe(3);
  });
});
