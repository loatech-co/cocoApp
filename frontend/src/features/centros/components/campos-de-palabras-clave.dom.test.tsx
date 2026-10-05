// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CamposDePalabrasClave } from './campos-de-palabras-clave';

/**
 * Escribir una palabra clave es escribir una LISTA, no una frase.
 *
 * Lo que se prueba aquí es el gesto, que es donde esto se rompe: Enter dentro
 * de un formulario envía el formulario, y en una ficha con un botón de guardar
 * eso significa cerrar la ficha con la palabra a medio escribir.
 */
afterEach(cleanup);

/** Como vive de verdad: dentro de un formulario con su botón de guardar. */
function Ficha({ onGuardar = vi.fn(), inicial = [] as string[] }) {
  const [palabras, setPalabras] = useState(inicial);
  return (
    <form onSubmit={onGuardar}>
      <CamposDePalabrasClave valor={palabras} onCambiar={setPalabras} />
      <button type="submit">Guardar</button>
    </form>
  );
}

const caja = () => screen.getByLabelText<HTMLInputElement>('Palabras clave');

function escribir(texto: string): void {
  fireEvent.change(caja(), { target: { value: texto } });
}

describe('Las palabras clave de un concepto', () => {
  it('Enter añade la palabra y NO guarda el formulario', () => {
    const onGuardar = vi.fn();
    render(<Ficha onGuardar={onGuardar} />);

    escribir('Aquaoccidente');
    fireEvent.keyDown(caja(), { key: 'Enter' });

    expect(screen.getByText('Aquaoccidente')).toBeTruthy();
    expect(caja().value).toBe('');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('una coma separa, así que una lista pegada entra entera', () => {
    render(<Ficha />);

    escribir('Celsia, EPSA, 805027653');
    fireEvent.keyDown(caja(), { key: 'Enter' });

    for (const palabra of ['Celsia', 'EPSA', '805027653']) {
      expect(screen.getByText(palabra)).toBeTruthy();
    }
  });

  it('lo escrito y no confirmado entra al salir del campo', () => {
    // Si no, escribir la palabra y pulsar «Guardar» la pierde en silencio.
    render(<Ficha />);

    escribir('Comfandi');
    fireEvent.blur(caja());

    expect(screen.getByText('Comfandi')).toBeTruthy();
  });

  it('el aspa quita la palabra', () => {
    render(<Ficha inicial={['Celsia', 'EPSA']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Celsia' }));

    expect(screen.queryByText('Celsia')).toBeNull();
    expect(screen.getByText('EPSA')).toBeTruthy();
  });

  it('el nombre de la palabra no es un botón: solo se quita', () => {
    render(<Ficha inicial={['Celsia']} />);

    expect(screen.queryByRole('button', { name: 'Celsia' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Quitar Celsia' })).toBeTruthy();
  });

  it('una palabra muy corta no entra, se dice por qué y se queda escrita', () => {
    render(<Ficha />);

    escribir('ao');
    fireEvent.keyDown(caja(), { key: 'Enter' });

    // Se queda en la caja: borrar lo que alguien acaba de teclear sin decir
    // por qué es la forma más rápida de que deje de escribir.
    expect(caja().value).toBe('ao');
    expect(screen.getByText(/muy corta/i)).toBeTruthy();
  });

  it('una repetida no se duplica', () => {
    render(<Ficha inicial={['Celsia']} />);

    escribir('CELSIA');
    fireEvent.keyDown(caja(), { key: 'Enter' });

    // Una sola en la lista. El aviso también la nombra, por eso se cuentan
    // los chips y no las veces que aparece el texto.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText(/ya está en la lista/i)).toBeTruthy();
  });

  it('retroceso con la caja vacía quita la última', () => {
    render(<Ficha inicial={['Celsia', 'EPSA']} />);

    fireEvent.keyDown(caja(), { key: 'Backspace' });

    expect(screen.queryByText('EPSA')).toBeNull();
    expect(screen.getByText('Celsia')).toBeTruthy();
  });
});
