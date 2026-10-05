// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { leerSoporte } from '@/features/transactions/api/leer-soporte';
import { type CategoryTree } from '@/shared/api/categories';
import { keys } from '@/shared/api/query-keys';

import { MovimientoModal } from './movimiento-modal';

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
const apiSubir = vi.fn();
/**
 * The generated client calls `apiRequest(url, init)` with the full v2 path and
 * a JSON string; the spy sees the route without `/api/v2` and the body as an
 * object, which is what these tests read.
 */
const comoRuta = (url: string, init?: RequestInit) =>
  red(url.replace(/^\/api\/v2/, ''), {
    method: init?.method ?? 'GET',
    ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}),
  });

vi.mock('@/shared/api/api-client', async () => {
  const real =
    await vi.importActual<typeof import('@/shared/api/api-client')>('@/shared/api/api-client');
  return {
    ...real,
    apiRequest: (url: string, init?: RequestInit) => comoRuta(url, init),
    apiSubir: (...args: unknown[]) => apiSubir(...args),
  };
});

vi.mock('@/features/transactions/api/leer-soporte', () => ({ leerSoporte: vi.fn() }));

/*
  El encogido, de paso.

  El de verdad abre la imagen con el navegador para saber cuánto mide, y jsdom
  no dibuja: se quedaría esperando hasta agotar su reloj de cinco segundos.
  Aquí se prueba qué pasa cuando la SUBIDA falla, no cómo se prepara el archivo
  —eso tiene sus propias pruebas en `lib/encoger-soporte.dom.test.ts`—.
*/
vi.mock('@/shared/lib/encoger-soporte', () => ({
  encogerSoportes: (archivos: File[]) => Promise.resolve(archivos),
  encogerSoporte: (archivo: File) => Promise.resolve(archivo),
}));

const ARBOL = [
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
const LECTURA_VACIA: Awaited<ReturnType<typeof leerSoporte>> = {
  texto: '',
  fuente: 'texto-embebido',
  lectura: {
    concepto: null,
    categoria: null,
    centro: null,
    valor: null,
    fecha: null,
    confianza: 0,
    señales: { texto: [], nombre: [], nit: [], recaudadoresIgnorados: [] },
    motivo: '',
    alternativas: [],
  },
};

beforeEach(() => {
  red.mockReset();
  apiSubir.mockReset();
  // La lectura espera un piso de cuatro segundos aunque ya haya terminado;
  // con el reloj falso se le pasa por encima en `adjuntar`.
  vi.useFakeTimers();
  vi.mocked(leerSoporte).mockReset();
  vi.mocked(leerSoporte).mockResolvedValue(LECTURA_VACIA);
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

  // La ficha nueva abre ya en el formulario.
  return vista;
}

/** Adjunta un archivo por el campo de verdad, que va escondido. */
async function adjuntar(container: HTMLElement): Promise<void> {
  const campo = container.querySelector('input[type="file"]')!;
  expect(campo).not.toBeNull();

  const archivo = new File([new Uint8Array(64)], 'captura.png', { type: 'image/png' });
  Object.defineProperty(campo, 'files', { value: [archivo], configurable: true });

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
    fireEvent.change(campo);
  });

  // El piso de la espera de la lectura: hasta que pasa, la ficha enseña el
  // documento leyéndose y no el formulario.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
}

async function registrar(): Promise<void> {
  const valor = document.getElementById('mov-valor') as HTMLInputElement;
  fireEvent.change(valor, { target: { value: '120000' } });

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
    fireEvent.submit(valor.closest('form')!);
  });
}

const llamadas = () => red.mock.calls.map(([ruta, opciones]) => [ruta, opciones?.method]);

/**
 * La red contesta por RUTA, no una cosa para todo.
 *
 * La ficha consulta el árbol de categorías nada más abrirse, y una respuesta
 * única le devolvía el `{ id }` de un movimiento donde esperaba una lista:
 * reventaba pintando los desplegables, antes de llegar a lo que se prueba.
 */
function responder({ alBorrar }: { alBorrar: () => Promise<unknown> }): void {
  red.mockImplementation((ruta: string, opciones?: { method?: string }) => {
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
    red.mockClear();
    await registrar();

    expect(llamadas()).toContainEqual(['/transactions/42', 'PATCH']);
    expect(llamadas().some(([ruta, metodo]) => ruta === '/transactions' && metodo === 'POST')).toBe(
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
  const creacion = () =>
    red.mock.calls.find(
      ([ruta, opciones]) =>
        ruta === '/transactions' &&
        (opciones as { method?: string } | undefined)?.method === 'POST',
    );

  it('manda source «web»; sin texto leído, rawText va vacío', async () => {
    responder({ alBorrar: () => Promise.resolve({ data: undefined }) });
    apiSubir.mockResolvedValue({ data: [] });

    const { container } = abrirFichaNueva();
    await adjuntar(container);
    await registrar();

    expect(creacion(), 'se creó el movimiento').toBeDefined();
    const cuerpo = (creacion()![1] as { body: Record<string, unknown> }).body;
    expect(cuerpo.source).toBe('web');
    expect(cuerpo.rawText).toBeNull();
    // Y lo de siempre sigue viajando igual.
    expect(cuerpo.amount).toBe('120000');
    // El soporte sí se leyó —es el primero de un movimiento nuevo—, pero no
    // sacó texto, y un texto vacío no viaja como cadena vacía: viaja como nulo.
    expect(vi.mocked(leerSoporte)).toHaveBeenCalledOnce();
  });
});
