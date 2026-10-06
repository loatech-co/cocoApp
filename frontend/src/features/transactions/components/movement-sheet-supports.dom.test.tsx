// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { leerSoporte } from '@/features/transactions/api/leer-soporte';
import {
  CELSIA_READING,
  openConfirmation,
  openNew,
  fakeReceiptBrowser,
} from '@/test-support/movement-sheet';

/*
  El lector de soportes, de mentira.

  El de verdad abre un PDF con pdf.js o enciende Tesseract, que no tienen nada
  que hacer en una prueba de esta ficha: lo que aquí se comprueba es qué pasa
  DESPUÉS de leer, no cómo se lee. Eso ya lo prueban `lib/palabras-clave` y el
  paquete de lectura.
*/
vi.mock('@/features/transactions/api/leer-soporte', () => ({
  leerSoporte: vi.fn(),
}));

afterEach(cleanup);

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
    fakeReceiptBrowser();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(leerSoporte).mockReset();
  });

  it('reemplaza el valor y la fecha esperados por los que dice el recibo', async () => {
    vi.mocked(leerSoporte).mockResolvedValue(CELSIA_READING);

    const { container } = openConfirmation();

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');

    const campo = container.querySelector('input[type="file"]')!;
    const recibo = new File(['x'], 'celsia-octubre.png', { type: 'image/png' });
    fireEvent.change(campo, { target: { files: [recibo] } });

    /*
      El piso de la espera: la lectura se ve siempre igual, tarde lo que tarde.

      Y dentro de `act`, que no es adorno. El `setPaso('formulario')` que cierra
      la lectura corre dentro de un temporizador FALSO, fuera de cualquier
      evento de React; así que React lo programa por su `Scheduler`, que en
      jsdom también usa `setTimeout`, y la prueba dependía de que los
      temporizadores falsos recogieran esa tarea antes de la aserción. Lo
      hacían si otra prueba del archivo había corrido antes y no si esta corría
      sola: pasaba en el archivo completo y fallaba aislada, siempre. `act`
      vacía el trabajo pendiente de React al terminar, y la prueba deja de
      depender de quién corra antes.
    */
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(vi.mocked(leerSoporte)).toHaveBeenCalledOnce();
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toMatch(/2 de octubre/i);
  });

  it('en un movimiento nuevo, el primer soporte también se lee', async () => {
    // Antes solo se leía confirmando un pago: quien pulsaba «Registrar
    // manualmente» en el «cómo empezar» había dicho que iba a teclearlo. Esa
    // pantalla ya no existe, así que no hay elección que respetar: lo leído
    // entra como propuesta a verificar, igual que al confirmar un pago.
    vi.mocked(leerSoporte).mockResolvedValue(CELSIA_READING);

    const { container } = openNew();

    const campo = container.querySelector('input[type="file"]')!;
    fireEvent.change(campo, {
      target: { files: [new File(['x'], 'recibo.png', { type: 'image/png' })] },
    });

    // En `act` por lo mismo que la prueba de arriba.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(vi.mocked(leerSoporte)).toHaveBeenCalledOnce();
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
  });
});

/**
 * Las dos vías que vivían en el «cómo empezar», ahora dentro del formulario.
 *
 * Lo que hace un archivo o una foto con la ficha es EXACTAMENTE lo de antes
 * —se lee, rellena los campos y queda como previsualización—; lo único que
 * cambió es desde dónde se dispara.
 */
describe('Cargar archivo y Tomar foto, dentro del formulario', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeReceiptBrowser();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(leerSoporte).mockReset();
  });

  it('«Cargar archivo» abre el panel de subir, y lo que se da ahí se lee y rellena el formulario', async () => {
    vi.mocked(leerSoporte).mockResolvedValue(CELSIA_READING);
    openNew();

    expect(screen.queryByRole('dialog', { name: 'Agregar soportes' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cargar archivo' }));

    const panel = screen.getByRole('dialog', { name: 'Agregar soportes' });
    const campo = panel.querySelector('input[type="file"]')!;
    fireEvent.change(campo, {
      target: { files: [new File(['x'], 'celsia-octubre.png', { type: 'image/png' })] },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(vi.mocked(leerSoporte)).toHaveBeenCalledOnce();
    expect(vi.mocked(leerSoporte).mock.calls[0]?.[0]?.name).toBe('celsia-octubre.png');
    // El panel se cerró, el formulario quedó relleno y el archivo queda como
    // previsualización en la columna del documento.
    expect(screen.queryByRole('dialog', { name: 'Agregar soportes' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('214.500');
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toMatch(/2 de octubre/i);
    expect(screen.getByRole('button', { name: 'Quitar este soporte' })).toBeDefined();
  });

  it('«Tomar foto» pasa a la cámara, y cancelar vuelve al formulario', () => {
    openNew();

    fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));

    // jsdom no tiene cámara: la vista lo dice y «Capturar» queda apagado. Lo
    // que se comprueba es que la ficha ESTÁ en la cámara, no que capture.
    expect(screen.getByText(/No se detectó ninguna cámara/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Capturar/ })).toBeDefined();
    expect(screen.queryByLabelText('Valor')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));

    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDefined();
  });
});
