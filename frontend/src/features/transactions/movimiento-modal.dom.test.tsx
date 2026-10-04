// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keys, type CategoryTree } from '@/lib/queries';
import { MovimientoModal } from './movimiento-modal';
import { leerSoporte } from './leer-soporte';
import type { PagoPendiente, Transaction } from '@coco/types';

/*
  El lector de soportes, de mentira.

  El de verdad abre un PDF con pdf.js o enciende Tesseract, que no tienen nada
  que hacer en una prueba de esta ficha: lo que aquí se comprueba es qué pasa
  DESPUÉS de leer, no cómo se lee. Eso ya lo prueban `lib/palabras-clave` y el
  paquete de lectura.
*/
vi.mock('./leer-soporte', () => ({
  leerSoporte: vi.fn(),
}));

/**
 * La ficha de un movimiento, abierta para EDITAR, tiene que llegar con su
 * clasificación puesta.
 *
 * Es lo que uno viene a comprobar cuando abre un movimiento ya registrado —«¿en
 * qué quedó clasificado esto?»—, y si los tres desplegables aparecen vacíos el
 * formulario está diciendo que no está clasificado, que es otra cosa. Peor: al
 * guardar cualquier corrección de la cifra, se guardaría también esa mentira.
 *
 * Se prueba a través de la ficha entera y no de `rutaSeleccionada` —que ya tiene
 * las suyas— porque el fallo que esto vigila no está en la búsqueda por el
 * árbol: está en si lo que se busca llega, y cuándo.
 */
const arbolCon = (estatico: boolean): CategoryTree[] =>
  [
  {
    id: 1,
    name: 'Costos fijos',
    kind: 'expense',
    estatico,
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

const ARBOL = arbolCon(false);

const MOVIMIENTO: Transaction = {
  id: 7,
  description: 'Celsia septiembre',
  amount: '120000',
  date: '2026-09-04',
  period: '2026-09-01',
  type: 'expense',
  category_id: 100,
  account_id: null,
  notes: null,
} as unknown as Transaction;

function abrirFicha(arbol: CategoryTree[]) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  cliente.setQueryData([...keys.categories, 'todas'], arbol);

  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter>
        <MovimientoModal abierta movimiento={MOVIMIENTO} onCerrar={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('La ficha de un movimiento que se edita', () => {
  it('llega con su centro de costos, su categoría y su concepto puestos', () => {
    abrirFicha(ARBOL);

    // La ficha abre en modo lectura: los campos se desbloquean al pedirlo.
    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));

    for (const nombre of ['Centro de costos', 'Categoría', 'Concepto']) {
      const disparador = screen.getByRole('button', { name: new RegExp(nombre) });
      expect(disparador, `el desplegable de ${nombre}`).toBeDefined();
    }

    expect(screen.getByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
    expect(screen.getByText('Celsia (Energía)')).toBeDefined();
  });

  it('los enseña aunque estén BLOQUEADOS por ser de un centro estático', () => {
    /*
      El fallo que arregla esto: `Combo`, bloqueado, pintaba el marcador e
      ignoraba lo elegido. En un centro estático los tres desplegables salen
      bloqueados a propósito —esa clasificación no se toca desde aquí—, así que
      un movimiento bien clasificado se leía como uno sin clasificar.

      Bloqueado quiere decir «esto no se cambia desde aquí», nunca «esto está
      vacío».
    */
    abrirFicha(arbolCon(true));

    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));

    expect(screen.getByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
    expect(screen.getByText('Celsia (Energía)')).toBeDefined();
  });

  it('también cuando el árbol de categorías llega DESPUÉS de abrirse', async () => {
    // El caso real: la ficha se abre antes de que responda la consulta de
    // categorías. Si la clasificación se resolviera una sola vez al montar, los
    // tres desplegables se quedarían vacíos para siempre.
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={cliente}>
        <MemoryRouter>
          <MovimientoModal abierta movimiento={MOVIMIENTO} onCerrar={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));
    cliente.setQueryData([...keys.categories, 'todas'], ARBOL);

    expect(await screen.findByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
    expect(screen.getByText('Celsia (Energía)')).toBeDefined();
  });
});

/**
 * La ficha de CONFIRMAR UN PAGO.
 *
 * Se abre desde la tarjeta de pagos pendientes del resumen, y es la misma ficha
 * de siempre con otro punto de partida: el concepto ya se sabe, el valor y la
 * fecha son los esperados, y lo único que falta es el papel que los corrija.
 *
 * Lo que se vigila aquí es que llegue PUESTA. Una ficha de confirmar que abre
 * en blanco obliga a copiar a mano, mirando la misma tarjeta que se acaba de
 * pulsar, tres datos que la app ya tenía.
 */
const PAGO: PagoPendiente = {
  category_id: 100,
  name: 'Celsia (Energía)',
  path: 'Costos fijos · Servicios públicos',
  periodicidad: 'mensual',
  due_date: '2026-10-05',
  expected_amount: '180000',
} as unknown as PagoPendiente;

/**
 * El mismo concepto, pero de los que se cubren a pedazos.
 *
 * El vencimiento va lejos de hoy A PROPÓSITO: si los dos cayeran en el mismo
 * día, la prueba de que la fecha es la de HOY pasaría igual estando mal.
 */
const PAGO_A_PEDAZOS: PagoPendiente = {
  category_id: 100,
  name: 'Celsia (Energía)',
  path: 'Costos fijos · Servicios públicos',
  periodicidad: 'mensual',
  due_date: '2026-10-25',
  expected_amount: '1200000',
  paid_amount: '320450',
  varios_pagos: true,
} as unknown as PagoPendiente;

function abrirConfirmacion(pago: PagoPendiente = PAGO) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  cliente.setQueryData([...keys.categories, 'todas'], ARBOL);

  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter>
        <MovimientoModal abierta movimiento={null} pago={pago} onCerrar={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('La ficha de confirmar un pago pendiente', () => {
  it('se titula «Confirmar pago» y dice cuál', () => {
    abrirConfirmacion();

    expect(screen.getByRole('heading', { name: 'Confirmar pago' })).toBeDefined();
    expect(screen.getByText(/Celsia \(Energía\)\./)).toBeDefined();
  });

  it('llega con el valor esperado y la fecha de vencimiento puestos', () => {
    abrirConfirmacion();

    // Se enseña agrupado y se guarda sin puntos.
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toMatch(/octubre/i);
  });

  it('llega con su clasificación puesta, sin preguntarla otra vez', () => {
    abrirConfirmacion();

    expect(screen.getByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
  });

  it('se salta el «cómo empezar»: abre directamente en el formulario', () => {
    // Esa pantalla pregunta si se parte del papel o de los datos, y aquí esa
    // pregunta ya está contestada.
    abrirConfirmacion();

    expect(screen.queryByText('Registrar manualmente')).toBeNull();
    expect(screen.queryByText('Subir un archivo')).toBeNull();
  });

  it('avisa de que el valor es un esperado, no un dato', () => {
    // Sin esto, un promedio de tres meses se ve igual que una cifra copiada del
    // recibo, y quien confirme sin mirar registra el promedio.
    abrirConfirmacion();

    expect(screen.getByText(/son los esperados/i)).toBeDefined();
  });

  it('un concepto que nunca se ha pagado abre sin valor, y lo dice de otra forma', () => {
    abrirConfirmacion({ ...PAGO, expected_amount: null });

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('');
    expect(screen.getByText(/se leen el valor y la fecha/i)).toBeDefined();
  });

  it('sin pago pendiente, un movimiento nuevo sigue empezando por el «cómo empezar»', () => {
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    cliente.setQueryData([...keys.categories, 'todas'], ARBOL);

    render(
      <QueryClientProvider client={cliente}>
        <MemoryRouter>
          <MovimientoModal abierta movimiento={null} onCerrar={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Registrar manualmente')).toBeDefined();
    expect(screen.getByRole('heading', { name: /Nuevo/ })).toBeDefined();
  });
});

/**
 * Y el soporte CORRIGE lo que estaba puesto.
 *
 * Es la otra mitad de confirmar un pago: los campos abren con lo esperado —el
 * promedio de los meses anteriores y el día en que vencía— y el recibo dice lo
 * que pasó de verdad. Adjuntarlo y que no cambiara nada dejaba al soporte de
 * adorno y obligaba a teclear, mirando el papel, lo que la app sabe leer.
 */
describe('El soporte adjuntado al confirmar un pago', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom no crea urls de blobs, y la columna del soporte hace una por
    // archivo para previsualizarlo.
    URL.createObjectURL = vi.fn(() => 'blob:prueba');
    URL.revokeObjectURL = vi.fn();
    // Tampoco trae `ResizeObserver`, que es con lo que el visor del soporte
    // mide su marco para encajar el documento dentro.
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(leerSoporte).mockReset();
  });

  it('reemplaza el valor y la fecha esperados por los que dice el recibo', async () => {
    vi.mocked(leerSoporte).mockResolvedValue({
      texto: 'CELSIA S.A. E.S.P. Total a pagar 214.500',
      fuente: 'texto-embebido',
      lectura: {
        concepto: 'Celsia (Energía)',
        categoria: null,
        centro: null,
        valor: 214500,
        fecha: '2026-10-02',
        confianza: 0.9,
        señales: { texto: [], nombre: [], nit: [], recaudadoresIgnorados: [] },
        motivo: '',
        alternativas: [],
      },
    });

    const { container } = abrirConfirmacion();

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');

    const campo = container.querySelector('input[type="file"]') as HTMLInputElement;
    const recibo = new File(['x'], 'celsia-octubre.png', { type: 'image/png' });
    fireEvent.change(campo, { target: { files: [recibo] } });

    // El piso de la espera: la lectura se ve siempre igual, tarde lo que tarde.
    await vi.advanceTimersByTimeAsync(4000);

    expect(vi.mocked(leerSoporte)).toHaveBeenCalledOnce();
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toMatch(/2 de octubre/i);
  });

  it('un movimiento que se registra a mano NO se relee encima', async () => {
    // Quien eligió «Registrar manualmente» eligió teclearlo: releerle encima lo
    // que acaba de escribir sería deshacerle el trabajo.
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    cliente.setQueryData([...keys.categories, 'todas'], ARBOL);

    const { container } = render(
      <QueryClientProvider client={cliente}>
        <MemoryRouter>
          <MovimientoModal abierta movimiento={null} onCerrar={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Registrar manualmente'));

    const campo = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(campo, {
      target: { files: [new File(['x'], 'recibo.png', { type: 'image/png' })] },
    });

    await vi.advanceTimersByTimeAsync(4000);

    expect(vi.mocked(leerSoporte)).not.toHaveBeenCalled();
  });
});

/**
 * Abonar no es confirmar.
 *
 * Un concepto normal se CONFIRMA: lo que se espera que cueste es lo que va a
 * costar, y traerlo escrito ahorra un paso. Uno que se paga en varias veces se
 * ABONA, y entonces el valor esperado es la peor sugerencia posible: al primer
 * «guardar» sin mirar, el mes queda cubierto de golpe y el concepto sale de la
 * lista como si estuviera resuelto.
 */
describe('La ficha de un concepto que se paga en varias veces', () => {
  /** Hoy en América/Bogotá, como lo escribe la aplicación. */
  function hoy(): Date {
    return new Date(Date.now() - 5 * 60 * 60 * 1000);
  }

  it('abre con el valor VACÍO, no con el total del mes', () => {
    abrirConfirmacion(PAGO_A_PEDAZOS);

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('');
  });

  it('y con la fecha de HOY, no con la del vencimiento', () => {
    // La ida al mercado fue hoy. El día del vencimiento es cuándo empieza a
    // contar el ciclo, no cuándo se gastó esto.
    abrirConfirmacion(PAGO_A_PEDAZOS);

    const fecha = screen.getByLabelText<HTMLInputElement>('Fecha').value;
    expect(fecha).toContain(String(hoy().getUTCDate()));
    expect(fecha).not.toContain('25');
  });

  it('se titula «Registrar otro», que es lo que ofrecía la lista', () => {
    // Abrir «Registrar otro» y encontrarse «Confirmar pago» es prometer que
    // esto cierra el mes.
    abrirConfirmacion(PAGO_A_PEDAZOS);

    expect(screen.getByRole('heading', { name: 'Registrar otro' })).toBeDefined();
  });

  it('avisa de que se anota lo de ESTA vez', () => {
    // Sin decirlo, la caja vacía se lee como un campo que falta por llenar
    // con el total, que es justo lo contrario.
    abrirConfirmacion(PAGO_A_PEDAZOS);

    expect(screen.getByText(/no el total del mes/i)).toBeDefined();
  });

  it('pero la clasificación sí viene puesta, como en cualquier pago', () => {
    // Lo que cambia es el importe y la fecha; de qué concepto es, no.
    abrirConfirmacion(PAGO_A_PEDAZOS);

    expect(screen.getByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
  });

  it('y uno normal sigue llegando con su valor esperado', () => {
    // La prueba que impide «arreglarlo» para todos: el alquiler se confirma.
    abrirConfirmacion(PAGO);

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');
  });
});
