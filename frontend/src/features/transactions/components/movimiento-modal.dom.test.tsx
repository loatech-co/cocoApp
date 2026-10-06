// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { keys } from '@/shared/api/query-keys';
import {
  TREE,
  TRANSACTION,
  PAYMENT,
  SPLIT_PAYMENT,
  openConfirmation,
  openSheet,
  openNew,
  treeWith,
  testQueryClient,
  renderSheet,
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
describe('La ficha de un movimiento que se edita', () => {
  it('llega con su centro de costos, su categoría y su concepto puestos', () => {
    openSheet(TREE);

    // La ficha abre en modo lectura: los campos se desbloquean al pedirlo.
    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));

    // La puerta es el buscador: enseña el concepto con su camino entero.
    expect(screen.getByRole('button', { name: /Concepto/ }).textContent).toContain(
      'Celsia (Energía)',
    );
    expect(screen.getByText(/Servicios públicos › Costos fijos/)).toBeDefined();

    // Y la cascada sigue existiendo, detrás de su enlace, con los tres puestos.
    fireEvent.click(screen.getByRole('button', { name: 'Elegir por centro y categoría' }));
    for (const nombre of ['Centro de costos', 'Categoría']) {
      const disparador = screen.getByRole('button', { name: new RegExp(nombre) });
      expect(disparador, `el desplegable de ${nombre}`).toBeDefined();
    }
    expect(screen.getByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
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
    openSheet(treeWith(true));

    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));

    // En un centro estático no hay nada que elegir pero sí que leer: el
    // buscador y la cascada salen bloqueados y los dos dicen qué es.
    expect(screen.getByText('Costos fijos')).toBeDefined();
    expect(screen.getByText('Servicios públicos')).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Concepto/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Elegir por centro y categoría' })).toBeNull();
  });

  it('también cuando el árbol de categorías llega DESPUÉS de abrirse', async () => {
    // El caso real: la ficha se abre antes de que responda la consulta de
    // categorías. Si la clasificación se resolviera una sola vez al montar, los
    // tres desplegables se quedarían vacíos para siempre.
    const cliente = testQueryClient();
    renderSheet({ movimiento: TRANSACTION }, cliente);

    fireEvent.click(screen.getByRole('button', { name: 'Editar movimiento' }));
    cliente.setQueryData([...keys.categories, 'todas'], TREE);

    expect(await screen.findByText(/Servicios públicos › Costos fijos/)).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
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
describe('La ficha de confirmar un pago pendiente', () => {
  it('se titula «Confirmar pago» y dice cuál', () => {
    openConfirmation();

    expect(screen.getByRole('heading', { name: 'Confirmar pago' })).toBeDefined();
    expect(screen.getByText(/Celsia \(Energía\)\./)).toBeDefined();
  });

  it('llega con el valor esperado y la fecha de vencimiento puestos', () => {
    openConfirmation();

    // Se enseña agrupado y se guarda sin puntos.
    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');
    expect(screen.getByLabelText<HTMLInputElement>('Fecha').value).toMatch(/octubre/i);
  });

  it('llega con su clasificación puesta, sin preguntarla otra vez', () => {
    openConfirmation();

    expect(screen.getByText(/Servicios públicos › Costos fijos/)).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
  });

  it('abre directamente en el formulario, sin ninguna pantalla delante', () => {
    openConfirmation();

    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(screen.queryByText('Registrar manualmente')).toBeNull();
    expect(screen.queryByText('Subir un archivo')).toBeNull();
  });

  it('avisa de que el valor es un esperado, no un dato', () => {
    // Sin esto, un promedio de tres meses se ve igual que una cifra copiada del
    // recibo, y quien confirme sin mirar registra el promedio.
    openConfirmation();

    expect(screen.getByText(/son los esperados/i)).toBeDefined();
  });

  it('un concepto que nunca se ha pagado abre sin valor, y lo dice de otra forma', () => {
    openConfirmation({ ...PAYMENT, expectedAmount: null });

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('');
    expect(screen.getByText(/se leen el valor y la fecha/i)).toBeDefined();
  });

  it('sin pago pendiente, un movimiento nuevo también abre en el formulario', () => {
    // La pantalla de «cómo empezar» que había delante se retiró: costaba un
    // clic en cada movimiento nuevo para una pregunta que casi siempre se
    // contestaba igual. Sus dos otras vías viven ahora dentro del formulario.
    openNew();

    expect(screen.getByRole('heading', { name: /Nuevo/ })).toBeDefined();
    expect(screen.getByLabelText('Valor')).toBeDefined();
    expect(screen.queryByText('Registrar manualmente')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cargar archivo' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDefined();
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
    openConfirmation(SPLIT_PAYMENT);

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('');
  });

  it('y con la fecha de HOY, no con la del vencimiento', () => {
    // La ida al mercado fue hoy. El día del vencimiento es cuándo empieza a
    // contar el ciclo, no cuándo se gastó esto.
    openConfirmation(SPLIT_PAYMENT);

    const fecha = screen.getByLabelText<HTMLInputElement>('Fecha').value;
    expect(fecha).toContain(String(hoy().getUTCDate()));
    expect(fecha).not.toContain('25');
  });

  it('se titula «Registrar otro», que es lo que ofrecía la lista', () => {
    // Abrir «Registrar otro» y encontrarse «Confirmar pago» es prometer que
    // esto cierra el mes.
    openConfirmation(SPLIT_PAYMENT);

    expect(screen.getByRole('heading', { name: 'Registrar otro' })).toBeDefined();
  });

  it('avisa de que se anota lo de ESTA vez', () => {
    // Sin decirlo, la caja vacía se lee como un campo que falta por llenar
    // con el total, que es justo lo contrario.
    openConfirmation(SPLIT_PAYMENT);

    expect(screen.getByText(/no el total del mes/i)).toBeDefined();
  });

  it('pero la clasificación sí viene puesta, como en cualquier pago', () => {
    // Lo que cambia es el importe y la fecha; de qué concepto es, no.
    openConfirmation(SPLIT_PAYMENT);

    expect(screen.getByText(/Servicios públicos › Costos fijos/)).toBeDefined();
    expect(screen.getAllByText('Celsia (Energía)').length).toBeGreaterThan(0);
  });

  it('y uno normal sigue llegando con su valor esperado', () => {
    // La prueba que impide «arreglarlo» para todos: el alquiler se confirma.
    openConfirmation(PAYMENT);

    expect(screen.getByLabelText<HTMLInputElement>('Valor').value).toBe('180.000');
  });
});
