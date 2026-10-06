// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CategoryTree } from '@/shared/api/categories';
import { keys } from '@/shared/api/query-keys';

import { TransactionModal } from './transaction-modal';

/*
  Cuántas veces tiene que tocar la pantalla una persona para anotar un gasto.

  La fase 2 lo fija como meta —cinco interacciones o menos con clasificación
  completa, cuatro o menos cuando la sugerencia acierta— y hasta ahora el único
  número que había era una cuenta a mano en el registro. Esta prueba CUENTA:
  cada gesto de la persona pasa por `gesto()`, y lo que se afirma al final es
  el total. Si la ficha gana un paso, el número sube y la prueba lo dice; si
  pierde uno, también, para que se anote.

  Lo que NO cuenta como interacción: leer. Ver que la sugerencia ya está
  puesta no es un gesto. Y se cuenta TODO desde que la ficha se abre: la ficha
  nueva abre ya en el formulario —la pantalla de «cómo empezar» que había
  delante se retiró—, así que el primer gesto es escribir el monto.
*/

const red = vi.fn();
/**
 * The generated client calls `apiRequest(url, init)` with the full v2 path and
 * a JSON string; the spy sees the route without `/api/v2` and the body as an
 * object, which is what these tests read.
 */
const asPath = (url: string, init?: RequestInit) =>
  red(url.replace(/^\/api\/v2/, ''), {
    method: init?.method ?? 'GET',
    ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}),
  });
vi.mock('@/shared/api/api-client', async () => {
  const real =
    await vi.importActual<typeof import('@/shared/api/api-client')>('@/shared/api/api-client');
  return { ...real, apiRequest: (url: string, init?: RequestInit) => asPath(url, init) };
});

vi.mock('@/features/transactions/api/leer-soporte', () => ({ leerSoporte: vi.fn() }));

/*
  La sugerencia del historial, de mentira y bajo control de cada prueba.

  La de verdad espera 400 ms y pregunta al servidor; aquí lo que se mide es
  cuántos gestos ahorra cuando ACIERTA, no cuándo llega. Devuelve siempre lo
  mismo porque, en una ficha a mano, la descripción de la que depende no se
  escribe —el campo libre se cambió por el buscador—: es la forma de poner una
  sugerencia encima del formulario sin pasar por un recibo.
*/
const suggestion = vi.fn<
  () => { categoryId: number; confidence: number; reason: 'historial' } | null
>(() => null);
vi.mock('@/features/transactions/hooks/use-sugerencia', () => ({
  useSugerenciaDeCategoria: () => suggestion(),
}));

const TREE = [
  {
    id: 1,
    name: 'Costos fijos',
    kind: 'expense',
    isStatic: false,
    children: [
      {
        id: 10,
        name: 'Servicios públicos',
        kind: 'expense',
        children: [
          {
            id: 100,
            name: 'Celsia (Energía)',
            kind: 'expense',
            keywords: ['celsia'],
            children: [],
          },
          { id: 101, name: 'Acueducto', kind: 'expense', children: [] },
        ],
      },
    ],
  },
] as unknown as CategoryTree[];

/** El contador. Cada gesto de la persona pasa por aquí y por ningún otro sitio. */
let interactions = 0;
function gesture(action: () => void): void {
  interactions += 1;
  action();
}

beforeEach(() => {
  interactions = 0;
  red.mockReset();
  suggestion.mockReturnValue(null);
  // La red contesta por ruta: la ficha pide el árbol y los recientes nada más
  // abrirse, y una respuesta única le daría un `{ id }` donde espera listas.
  red.mockImplementation((path: string, options?: { method?: string }) => {
    if (options?.method === 'POST' && path === '/transactions')
      return Promise.resolve({ data: { id: 42 } });
    if (path.startsWith('/categories')) return Promise.resolve({ data: TREE });
    if (path.startsWith('/transactions')) return Promise.resolve({ data: [], meta: {} });
    return Promise.resolve({ data: null, meta: {} });
  });
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(cleanup);

function openNewSheet(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData([...keys.categories, 'todas'], TREE);

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionModal isOpen transaction={null} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const typeAmount = () =>
  gesture(() =>
    fireEvent.change(document.getElementById('mov-valor')!, { target: { value: '120000' } }),
  );

async function save(): Promise<void> {
  // El `async` sin `await` es a propósito: `act` asíncrono vacía además la
  // cola de microtareas, donde se resuelven las peticiones que dispara el
  // envío. Con la versión síncrona se miraría la red de antes.
  // eslint-disable-next-line @typescript-eslint/require-await -- ver arriba
  await act(async () => {
    gesture(() => fireEvent.submit(document.getElementById('mov-valor')!.closest('form')!));
  });
}

/** Lo que se mandó a crear, para comprobar que fue CON clasificación. */
const createdBody = () =>
  red.mock.calls.find(([path, o]) => path === '/transactions' && o?.method === 'POST')?.[1]
    ?.body as { categoryId: number | null; amount: unknown } | undefined;

const wasLearned = () => red.mock.calls.some(([path]) => path === '/categorization/learn');

describe('Registrar un gasto con clasificación completa', () => {
  it('a mano, por el buscador: cinco gestos desde que se abre la ficha', async () => {
    openNewSheet();

    // La ficha abre en el formulario: no hay nada que pulsar antes de escribir.
    expect(screen.queryByText('Registrar manualmente')).toBeNull();

    typeAmount(); // 1

    // El buscador es un botón que abre la caja de búsqueda: abrirlo es un
    // gesto, escribir es otro, elegir el resultado es el tercero.
    gesture(() => fireEvent.click(screen.getByRole('button', { name: /Concepto/ }))); // 2
    gesture(() =>
      fireEvent.change(screen.getByLabelText('Buscar concepto o categoría'), {
        target: { value: 'celsia' },
      }),
    ); // 3
    gesture(() => fireEvent.click(screen.getByRole('option', { name: /^Celsia/ }))); // 4

    await save(); // 5

    expect(createdBody()).toMatchObject({ categoryId: 100 });
    // Nadie sugirió nada: clasificar a mano no es confirmar una sugerencia.
    expect(wasLearned()).toBe(false);

    /*
      El número real, contándolo TODO desde que se abre la ficha: monto,
      abrir el buscador, escribir, elegir y guardar. Son exactamente los
      cinco que pide la meta (≤ 5); el sexto que había era la pantalla de
      «cómo empezar», y ya no está.
    */
    expect(interactions).toBe(5);
  });

  it('con una sugerencia que acierta: dos gestos desde que se abre la ficha', async () => {
    suggestion.mockReturnValue({ categoryId: 100, confidence: 0.9, reason: 'historial' });
    openNewSheet();

    typeAmount(); // 1

    // La sugerencia ya está puesta y dice de dónde salió. Mirarla no es un
    // gesto: la regla de no guardar nunca una clasificación sin que la
    // persona la VEA se cumple con tenerla delante, no con un clic más.
    expect(screen.getByRole('button', { name: /Concepto/ }).textContent).toContain(
      'Celsia (Energía)',
    );
    expect(screen.getByText(/Sugerido por tu historial/)).toBeDefined();

    await save(); // 2

    expect(createdBody()).toMatchObject({ categoryId: 100 });

    /*
      Hubo sugerencia, pero no hay de qué aprender: la ficha a mano no tiene
      descripción —el campo libre se cambió por el buscador— y una regla
      sin texto no es una regla. `learn` solo se llama con descripción, y
      ese camino —el de un recibo leído— lo cubre la e2e de la API.
    */
    expect(wasLearned()).toBe(false);

    /*
      El número real, por debajo del ≤ 4 de la meta: monto y guardado, y
      nada más. Sin el «cómo empezar» delante, la sugerencia que acierta deja
      la ficha en dos gestos.
    */
    expect(interactions).toBe(2);
  });
});
