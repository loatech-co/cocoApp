// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KeywordsFields } from './keywords-fields';

/**
 * Typing a keyword is typing a LIST, not a sentence.
 *
 * What is tested here is the gesture, which is where this breaks: Enter inside
 * a form submits the form, and in a sheet with a save button
 * that means closing the sheet with the word half-typed.
 */
afterEach(cleanup);

/** As it really lives: inside a form with its save button. */
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

describe('The keywords of a concept', () => {
  it('Enter adds the word and does NOT submit the form', () => {
    const onSave = vi.fn();
    render(<Harness onGuardar={onSave} />);

    typeText('Aquaoccidente');
    fireEvent.keyDown(keywordsInput(), { key: 'Enter' });

    expect(screen.getByText('Aquaoccidente')).toBeTruthy();
    expect(keywordsInput().value).toBe('');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a comma separates, so a pasted list goes in whole', () => {
    render(<Harness />);

    typeText('Celsia, EPSA, 805027653');
    fireEvent.keyDown(keywordsInput(), { key: 'Enter' });

    for (const keyword of ['Celsia', 'EPSA', '805027653']) {
      expect(screen.getByText(keyword)).toBeTruthy();
    }
  });

  it('what is typed and not confirmed goes in when leaving the field', () => {
    // Otherwise, typing the word and pressing «Guardar» loses it silently.
    render(<Harness />);

    typeText('Comfandi');
    fireEvent.blur(keywordsInput());

    expect(screen.getByText('Comfandi')).toBeTruthy();
  });

  it('the cross removes the word', () => {
    render(<Harness inicial={['Celsia', 'EPSA']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Celsia' }));

    expect(screen.queryByText('Celsia')).toBeNull();
    expect(screen.getByText('EPSA')).toBeTruthy();
  });

  it('the name of the word is not a button: it can only be removed', () => {
    render(<Harness inicial={['Celsia']} />);

    expect(screen.queryByRole('button', { name: 'Celsia' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Quitar Celsia' })).toBeTruthy();
  });

  it('a very short word does not go in, it says why and stays typed', () => {
    render(<Harness />);

    typeText('ao');
    fireEvent.keyDown(keywordsInput(), { key: 'Enter' });

    // It stays in the box: deleting what someone just typed without saying
    // why is the fastest way to make them stop typing.
    expect(keywordsInput().value).toBe('ao');
    expect(screen.getByText(/muy corta/i)).toBeTruthy();
  });

  it('a repeated one is not duplicated', () => {
    render(<Harness inicial={['Celsia']} />);

    typeText('CELSIA');
    fireEvent.keyDown(keywordsInput(), { key: 'Enter' });

    // Only one in the list. The warning also names it, that is why the
    // chips are counted and not the times the text appears.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText(/ya está en la lista/i)).toBeTruthy();
  });

  it('backspace with the box empty removes the last one', () => {
    render(<Harness inicial={['Celsia', 'EPSA']} />);

    fireEvent.keyDown(keywordsInput(), { key: 'Backspace' });

    expect(screen.queryByText('EPSA')).toBeNull();
    expect(screen.getByText('Celsia')).toBeTruthy();
  });
});
