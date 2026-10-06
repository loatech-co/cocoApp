// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Input } from '@/shared/ui/atoms/input';

import { DateSelector } from './selector-de-fecha';

/**
 * La fecha se escribe, y lo escrito se entiende.
 *
 * Abrir el calendario para poner el 3 de marzo del año pasado son cuatro clics
 * de flecha antes de empezar a mirar. Quien tiene el recibo delante ya sabe la
 * fecha, así que el camino corto es teclearla —y que la app la entienda como
 * la escriba cada quien, que es distinto de obligar a un formato.
 */
afterEach(cleanup);

const dateField = () => screen.getByPlaceholderText<HTMLInputElement>(/septiembre/i);

function type(text: string, onSelect = vi.fn()) {
  render(<DateSelector value="2026-04-04" onSelect={onSelect} />);
  const field = dateField();
  fireEvent.change(field, { target: { value: text } });
  fireEvent.blur(field);
  return onSelect;
}

describe('El campo de fecha que se escribe', () => {
  it.each([
    ['19 de septiembre 2026', '2026-09-19'],
    ['19 de septiembre de 2026', '2026-09-19'],
    ['sep 10 2026', '2026-09-10'],
    ['10 sep 2026', '2026-09-10'],
    ['10/09/2026', '2026-09-10'],
    ['10-09-2026', '2026-09-10'],
    ['2026-09-10', '2026-09-10'],
  ])('entiende «%s»', (typed, iso) => {
    expect(type(typed)).toHaveBeenCalledWith(iso);
  });

  it('lo que no se entiende vuelve a la última fecha válida', () => {
    // Quedarse con un texto que no es una fecha dejaría el campo diciendo una
    // cosa y el formulario guardando otra.
    const onSelect = type('el martes pasado');

    expect(onSelect).not.toHaveBeenCalled();
    expect(dateField().value).toBe('4 de abril de 2026');
  });

  it('vaciarlo tampoco borra la fecha por accidente', () => {
    const onSelect = type('   ');

    expect(onSelect).not.toHaveBeenCalled();
    expect(dateField().value).toBe('4 de abril de 2026');
  });

  it('normaliza aunque se escriba la MISMA fecha de otra forma', () => {
    // Aquí `onElegir` no se dispara —el valor no cambia—, así que si el campo
    // no se reescribiera solo, se quedaría con el «04/04/2026» tecleado.
    const onSelect = type('04/04/2026');

    expect(onSelect).not.toHaveBeenCalled();
    expect(dateField().value).toBe('4 de abril de 2026');
  });

  it('Enter confirma sin enviar el formulario', () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn((e: React.SubmitEvent) => e.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <DateSelector value="2026-04-04" onSelect={onSelect} />
      </form>,
    );

    const field = dateField();
    fireEvent.change(field, { target: { value: '10/09/2026' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('2026-09-10');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

/*
  Los ganchos que la etiqueta flotante de `Campo` necesita, en el selector de
  fecha. Vivían en `shared/ui/atoms/field.test.tsx`; están aquí porque el
  selector es de la feature de movimientos y `shared` no importa de una
  feature.
*/
describe('El selector de fecha dentro de un campo', () => {
  it('el selector de fecha dice lo mismo, y su icono va al final sin flecha', () => {
    const { container } = render(<DateSelector value="2026-04-04" onSelect={() => {}} />);

    /*
      El selector de fecha SE ESCRIBE, así que la etiqueta flota por donde
      flota la de cualquier campo de texto: `:placeholder-shown`. Para que esa
      regla enganche hacen falta las dos cosas —un marcador declarado y un
      valor dentro—, y por eso se comprueban las dos y no la clase que pinta.
    */
    const field = container.querySelector('input:not([type="hidden"])');
    expect(field?.getAttribute('placeholder')).toBeTruthy();
    expect((field as HTMLInputElement | null)?.value).toBe('4 de abril de 2026');

    // Y el valor viaja en ISO para el formulario, no como se escribe.
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"]')?.value).toBe(
      '2026-04-04',
    );
    // El calendario es la señal de que esto abre un calendario, que es el
    // papel de la flecha en un desplegable: con las dos, había dos iconos
    // diciendo lo mismo, uno a cada lado del valor.
    expect(container.querySelector('.lucide-calendar-days')).not.toBeNull();
    expect(container.querySelector('.lucide-chevron-down')).toBeNull();
  });

  it('el valor de un selector de fecha arranca donde arranca su etiqueta', () => {
    /*
      Esto se rompió y se veía como un escalón: la etiqueta a 12px del borde y
      el valor a 20.

      La causa es de orden, no de valor: `cva` emite base, variante y tamaño en
      ese orden, así que el `px-5` del tamaño gana a cualquier `px-3` escrito en
      la variante. Lo tiene que poner la llamada, que es lo último que ve `cn`.

      Se compara contra el `Input`, que es el vecino con el que tiene que
      alinearse, y no contra un `'px-3'` literal: si algún día el relleno de
      los campos cambia, esta prueba sigue midiendo lo que importa.
    */
    const textField = render(<Input />);
    const fieldPadding = (textField.container.querySelector('input')?.className ?? '')
      .split(/\s+/)
      .filter((c) => c.startsWith('px-'));
    expect(fieldPadding).toHaveLength(1);

    cleanup();

    // La CAJA del campo, que es la que lleva el relleno. El botón de dentro es
    // el del calendario, y ese se sangra solo.
    const date = render(<DateSelector value="2026-04-04" onSelect={() => {}} />);
    const box = date.container.querySelector('input:not([type="hidden"])')?.parentElement;
    const datePadding = (box?.className ?? '').split(/\s+/).filter((c) => c.startsWith('px-'));

    expect(datePadding, 'el selector de fecha se sangra como un campo de texto').toEqual(
      fieldPadding,
    );
  });
});
