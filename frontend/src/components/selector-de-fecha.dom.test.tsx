// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectorDeFecha } from './selector-de-fecha';

/**
 * La fecha se escribe, y lo escrito se entiende.
 *
 * Abrir el calendario para poner el 3 de marzo del año pasado son cuatro clics
 * de flecha antes de empezar a mirar. Quien tiene el recibo delante ya sabe la
 * fecha, así que el camino corto es teclearla —y que la app la entienda como
 * la escriba cada quien, que es distinto de obligar a un formato.
 */
afterEach(cleanup);

const campoDeFecha = () => screen.getByPlaceholderText(/septiembre/i) as HTMLInputElement;

function escribir(texto: string, onElegir = vi.fn()) {
  render(<SelectorDeFecha valor="2026-04-04" onElegir={onElegir} />);
  const campo = campoDeFecha();
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.blur(campo);
  return onElegir;
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
  ])('entiende «%s»', (escrito, iso) => {
    expect(escribir(escrito)).toHaveBeenCalledWith(iso);
  });

  it('lo que no se entiende vuelve a la última fecha válida', () => {
    // Quedarse con un texto que no es una fecha dejaría el campo diciendo una
    // cosa y el formulario guardando otra.
    const onElegir = escribir('el martes pasado');

    expect(onElegir).not.toHaveBeenCalled();
    expect(campoDeFecha().value).toBe('4 de abril de 2026');
  });

  it('vaciarlo tampoco borra la fecha por accidente', () => {
    const onElegir = escribir('   ');

    expect(onElegir).not.toHaveBeenCalled();
    expect(campoDeFecha().value).toBe('4 de abril de 2026');
  });

  it('normaliza aunque se escriba la MISMA fecha de otra forma', () => {
    // Aquí `onElegir` no se dispara —el valor no cambia—, así que si el campo
    // no se reescribiera solo, se quedaría con el «04/04/2026» tecleado.
    const onElegir = escribir('04/04/2026');

    expect(onElegir).not.toHaveBeenCalled();
    expect(campoDeFecha().value).toBe('4 de abril de 2026');
  });

  it('Enter confirma sin enviar el formulario', () => {
    const onElegir = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <SelectorDeFecha valor="2026-04-04" onElegir={onElegir} />
      </form>,
    );

    const campo = campoDeFecha();
    fireEvent.change(campo, { target: { value: '10/09/2026' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(onElegir).toHaveBeenCalledWith('2026-09-10');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
