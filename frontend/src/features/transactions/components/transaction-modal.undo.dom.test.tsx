// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readReceipt } from '@/features/transactions/api/read-receipt';
import { type CategoryTree } from '@/shared/api/categories';
import { keys } from '@/shared/api/query-keys';

import { TransactionModal } from './transaction-modal';

/*
  La red, de mentira.

  `ApiClientError` se reexporta DE VERDAD —no una copia— porque la ficha
  decide qué mensaje enseñar con un `instanceof`: una clase paralela con el
  mismo nombre no coincidiría, y la prueba pasaría por el camino equivocado
  sin que se notara.
*/
const { ApiClientError } =
  await vi.importActual<typeof import('@/shared/api/api-client')>('@/shared/api/api-client');

const red = vi.fn();
const apiUpload = vi.fn();
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
  return {
    ...real,
    apiRequest: (url: string, init?: RequestInit) => asPath(url, init),
    apiUpload: (...args: unknown[]) => apiUpload(...args),
  };
});

vi.mock('@/features/transactions/api/read-receipt', () => ({ readReceipt: vi.fn() }));

/*
  El encogido, de paso.

  El de verdad abre la imagen con el navegador para saber cuánto mide, y jsdom
  no dibuja: se quedaría esperando hasta agotar su reloj de cinco segundos.
  Aquí se prueba qué pasa cuando la SUBIDA falla, no cómo se prepara el archivo
  —eso tiene sus propias pruebas en `lib/encoger-soporte.dom.test.ts`—.
*/
vi.mock('@/shared/lib/shrink-receipt', () => ({
  shrinkReceipts: (files: File[]) => Promise.resolve(files),
  shrinkReceipt: (file: File) => Promise.resolve(file),
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
        children: [{ id: 100, name: 'Celsia (Energía)', kind: 'expense', children: [] }],
      },
    ],
  },
] as unknown as CategoryTree[];

/*
  Lo que el lector de mentira devuelve: un archivo que se abrió y en el que no
  se reconoció nada.

  El primer soporte de un movimiento nuevo se LEE —desde que la ficha abre en
  el formulario no hay un «Registrar manualmente» que diga lo contrario—, y
  aquí lo que se prueba es qué pasa cuando la SUBIDA falla, no la lectura.
  Un lector que no saca nada deja el formulario como estaba.
*/
const EMPTY_READING: Awaited<ReturnType<typeof readReceipt>> = {
  text: '',
  source: 'texto-embebido',
  reading: {
    concept: null,
    category: null,
    costCenter: null,
    value: null,
    date: null,
    confidence: 0,
    signals: { text: [], name: [], nit: [], ignoredCollectors: [] },
    reason: '',
    alternatives: [],
  },
};

beforeEach(() => {
  red.mockReset();
  apiUpload.mockReset();
  // La lectura espera un piso de cuatro segundos aunque ya haya terminado;
  // con el reloj falso se le pasa por encima en `adjuntar`.
  vi.useFakeTimers();
  vi.mocked(readReceipt).mockReset();
  vi.mocked(readReceipt).mockResolvedValue(EMPTY_READING);
  URL.createObjectURL = vi.fn(() => 'blob:prueba');
  URL.revokeObjectURL = vi.fn();
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function openNewSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData([...keys.categories, 'todas'], TREE);

  const vista = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionModal isOpen transaction={null} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // La ficha nueva abre ya en el formulario.
  return vista;
}

/** Adjunta un archivo por el campo de verdad, que va escondido. */
async function attach(container: HTMLElement): Promise<void> {
  const field = container.querySelector('input[type="file"]')!;
  expect(field).not.toBeNull();

  const file = new File([new Uint8Array(64)], 'captura.png', { type: 'image/png' });
  Object.defineProperty(field, 'files', { value: [file], configurable: true });

  /*
    El `async` sin `await` dentro es a propósito, y no es intercambiable.

    `act` mira si lo que le devuelven es un thenable: con la versión síncrona
    vacía los efectos y vuelve; con la asíncrona vacía ADEMÁS la cola de
    microtareas, que es donde se resuelven las promesas que disparó el evento.
    Esta prueba depende de eso —el cambio de archivo lanza la lectura del
    soporte, que es asíncrona— y con `act(() => …)` mira el DOM de antes.
  */
  // eslint-disable-next-line @typescript-eslint/require-await -- ver arriba
  await act(async () => {
    fireEvent.change(field);
  });

  // El piso de la espera de la lectura: hasta que pasa, la ficha enseña el
  // documento leyéndose y no el formulario.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
}

async function record(): Promise<void> {
  const value = document.getElementById('mov-valor') as HTMLInputElement;
  fireEvent.change(value, { target: { value: '120000' } });

  /*
    El `async` sin `await` dentro es a propósito, y no es intercambiable.

    `act` mira si lo que le devuelven es un thenable: con la versión síncrona
    vacía los efectos y vuelve; con la asíncrona vacía ADEMÁS la cola de
    microtareas, que es donde se resuelven las promesas que disparó el evento.
    Esta prueba depende de eso —el cambio de archivo lanza la lectura del
    soporte, que es asíncrona— y con `act(() => …)` mira el DOM de antes.
  */
  // eslint-disable-next-line @typescript-eslint/require-await -- ver arriba
  await act(async () => {
    fireEvent.submit(value.closest('form')!);
  });
}

const calls = () => red.mock.calls.map(([path, options]) => [path, options?.method]);

/**
 * La red contesta por RUTA, no una cosa para todo.
 *
 * La ficha consulta el árbol de categorías nada más abrirse, y una respuesta
 * única le devolvía el `{ id }` de un movimiento donde esperaba una lista:
 * reventaba pintando los desplegables, antes de llegar a lo que se prueba.
 */
function respond({ onDelete }: { onDelete: () => Promise<unknown> }): void {
  red.mockImplementation((path: string, options?: { method?: string }) => {
    if (options?.method === 'DELETE') return onDelete();
    if (path.startsWith('/categories')) return Promise.resolve({ data: TREE });
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
    respond({ onDelete: () => Promise.resolve({ data: undefined }) });
    apiUpload.mockRejectedValue(
      new ApiClientError(503, 'service_unavailable', 'Al servidor se le acabaron los recursos.'),
    );

    const { container } = openNewSheet();
    await attach(container);
    await record();

    // Se creó, falló el soporte, y lo creado se fue.
    expect(apiUpload).toHaveBeenCalledOnce();
    expect(calls()).toContainEqual(['/transactions/42', 'DELETE']);

    // Y se dice sin rodeos: no quedó nada. Quien lea otra cosa se va a quedar
    // buscando en la tabla un movimiento que no existe.
    expect(screen.getByText(/No quedó registrado nada/)).toBeDefined();
  });

  it('si tampoco se pudo deshacer, lo dice y no duplica al reintentar', async () => {
    respond({ onDelete: () => Promise.reject(new Error('sin conexión')) });
    apiUpload.mockRejectedValue(
      new ApiClientError(503, 'service_unavailable', 'Falló el soporte.'),
    );

    const { container } = openNewSheet();
    await attach(container);
    await record();

    expect(screen.getByText(/quedó registrado/)).toBeDefined();

    // El reintento ACTUALIZA el 42 en vez de crear un segundo movimiento por
    // la misma plata: es el caso que obligaba a recordar el id.
    red.mockClear();
    await record();

    expect(calls()).toContainEqual(['/transactions/42', 'PATCH']);
    expect(calls().some(([path, method]) => path === '/transactions' && method === 'POST')).toBe(
      false,
    );
  });
});

/**
 * Lo que la web guarda ahora dice de dónde entró. El texto de un recibo solo
 * viaja cuando hubo lectura; adjuntar a mano no lee —otra prueba lo protege—,
 * así que aquí `rawText` va vacío a propósito.
 */
describe('Lo que la web guarda', () => {
  const creation = () =>
    red.mock.calls.find(
      ([path, options]) =>
        path === '/transactions' && (options as { method?: string } | undefined)?.method === 'POST',
    );

  it('manda source «web»; sin texto leído, rawText va vacío', async () => {
    respond({ onDelete: () => Promise.resolve({ data: undefined }) });
    apiUpload.mockResolvedValue({ data: [] });

    const { container } = openNewSheet();
    await attach(container);
    await record();

    expect(creation(), 'se creó el movimiento').toBeDefined();
    const body = (creation()![1] as { body: Record<string, unknown> }).body;
    expect(body.source).toBe('web');
    expect(body.rawText).toBeNull();
    // Y lo de siempre sigue viajando igual.
    expect(body.amount).toBe('120000');
    // El soporte sí se leyó —es el primero de un movimiento nuevo—, pero no
    // sacó texto, y un texto vacío no viaja como cadena vacía: viaja como nulo.
    expect(vi.mocked(readReceipt)).toHaveBeenCalledOnce();
  });
});
