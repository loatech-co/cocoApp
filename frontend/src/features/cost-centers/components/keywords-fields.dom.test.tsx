// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KeywordsFields } from './keywords-fields';

/**
 * Escribir una palabra clave es escribir una LISTA, no una frase.
 *
 * Lo que se prueba aquí es el gesto, que es donde esto se rompe: Enter dentro
 * de un formulario envía el formulario, y en una ficha con un botón de guardar
 * eso significa cerrar la ficha con la palabra a medio escribir.
 */
afterEach(cleanup);

/** Como vive de verdad: dentro de un formulario con su botón de guardar. */
function Harness({ onGuardar: onSave = vi.fn(), inicial: initial = [] as string[] }) {
  const [keywords, setKeywords] = useState(initial);
  return (
    <form onSubmit={onSave}>
      <KeywordsFields value={keywords} onChange={setKeywords} />
      <button type="submit">Guardar</button>
    </form>
  );
}

const keywordsInput = () => screen.getByLabelText<HTMLInputElement>('Palabras clave');

function typeText(text: string): void {
  fireEvent.change(keywordsInput(), { target: { value: text } });
}

describe('Las palabras clave de un concepto', () => {
  it('Enter añade la palabra y NO guarda el formulario', () => {
    const onSave = vi.fn();
    render(<Harness onGuardar={onSave} />);

    typeText('Aquaoccidente');
    fireEvent.keyDown(keywordsInput(), { key: 'Enter' });

    expect(screen.getByText('Aquaoccidente')).toBeTruthy();
    expect(keywordsInput().value).toBe('');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('una coma separa, así que una lista pegada entra entera', () => {
    render(<Harness />);

    typeText('Celsia, EPSA, 805027653');
    fireEvent.keyDown(keywordsInput(), { key: 'Enter' });

    for (const keyword of ['Celsia', 'EPSA', '805027653']) {
      expect(screen.getByText(keyword)).toBeTruthy();
    }
  });

  it('lo escrito y no confirmado entra al salir del campo', () => {
    // Si no, escribir la palabra y pulsar «Guardar» la pierde en silencio.
    render(<Harness />);

    typeText('Comfandi');
    fireEvent.blur(keywordsInput());

    expect(screen.getByText('Comfandi')).toBeTruthy();
  });

  it('el aspa quita la palabra', () => {
    render(<Harness inicial={['Celsia', 'EPSA']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Celsia' }));

    expect(screen.queryByText('Celsia')).toBeNull();
    expect(screen.getByText('EPSA')).toBeTruthy();
  });

  it('el nombre de la palabra no es un botón: solo se quita', () => {
    render(<Harness inicial={['Celsia']} />);

    expect(screen.queryByRole('button', { name: 'Celsia' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Quitar Celsia' })).toBeTruthy();
  });

  it('una palabra muy corta no entra, se dice por qué y se queda escrita', () => {
    render(<Harness />);

    typeText('ao');
    fireEvent.keyDown(keywordsInput(), { key: 'Enter' });

    // Se queda en la caja: borrar lo que alguien acaba de teclear sin decir
    // por qué es la forma más rápida de que deje de escribir.
    expect(keywordsInput().value).toBe('ao');
    expect(screen.getByText(/muy corta/i)).toBeTruthy();
  });

  it('una repetida no se duplica', () => {
    render(<Harness inicial={['Celsia']} />);

    typeText('CELSIA');
    fireEvent.keyDown(keywordsInput(), { key: 'Enter' });

    // Una sola en la lista. El aviso también la nombra, por eso se cuentan
    // los chips y no las veces que aparece el texto.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText(/ya está en la lista/i)).toBeTruthy();
  });

  it('retroceso con la caja vacía quita la última', () => {
    render(<Harness inicial={['Celsia', 'EPSA']} />);

    fireEvent.keyDown(keywordsInput(), { key: 'Backspace' });

    expect(screen.queryByText('EPSA')).toBeNull();
    expect(screen.getByText('Celsia')).toBeTruthy();
  });
});
