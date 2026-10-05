// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Combo } from './combo';

afterEach(cleanup);

const OPTIONS = [
  { valor: '1', etiqueta: 'Aseo' },
  { valor: '2', etiqueta: 'Alimentación' },
  { valor: '3', etiqueta: 'Transporte' },
];

function renderCombo(props: Partial<Parameters<typeof Combo>[0]> = {}) {
  const onCambiar = vi.fn();
  render(
    <Combo etiqueta="Concepto" valor="" opciones={OPTIONS} onCambiar={onCambiar} {...props} />,
  );
  return { onCambiar };
}

function open(name: RegExp | string = /Sin elegir/): HTMLInputElement {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByPlaceholderText('Buscar…');
}

describe('Combo', () => {
  it('shows the placeholder until something is chosen', () => {
    renderCombo();

    expect(screen.getByRole('button', { name: /Sin elegir/ })).toBeTruthy();
  });

  it('shows the chosen option on its trigger', () => {
    renderCombo({ valor: '3' });

    expect(screen.getByRole('button', { name: /Transporte/ })).toBeTruthy();
  });

  it('opens a listbox with every option plus the empty one', () => {
    renderCombo({ valor: '1' });

    open(/Aseo/);

    expect(screen.getByRole('listbox', { name: 'Concepto' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('option', { name: /Aseo/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('puts the cursor in the search box when it opens, because opening it asked to search', async () => {
    renderCombo();

    const search = open();

    await waitFor(() => expect(document.activeElement).toBe(search));
  });

  it('filters ignoring case and accents', () => {
    renderCombo();
    const search = open();

    fireEvent.change(search, { target: { value: 'ALIMENTACION' } });

    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names).toEqual(['Sin elegir', 'Alimentación']);
  });

  it('says so when nothing matches and nothing can be created', () => {
    renderCombo();
    const search = open();

    fireEvent.change(search, { target: { value: 'zzz' } });

    expect(screen.getByText('Nada coincide.')).toBeTruthy();
  });

  it('reports the clicked option and closes', () => {
    const { onCambiar } = renderCombo();
    open();

    fireEvent.click(screen.getByRole('option', { name: 'Transporte' }));

    expect(onCambiar).toHaveBeenCalledWith('3');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clears the choice with the empty option', () => {
    const { onCambiar } = renderCombo({ valor: '2' });
    open(/Alimentación/);

    fireEvent.click(screen.getByRole('option', { name: 'Sin elegir' }));

    expect(onCambiar).toHaveBeenCalledWith('');
  });

  it('chooses the only match with Enter', () => {
    const { onCambiar } = renderCombo();
    const search = open();

    fireEvent.change(search, { target: { value: 'tra' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onCambiar).toHaveBeenCalledWith('3');
  });

  it('does nothing on Enter when several options match and nothing can be created', () => {
    const { onCambiar } = renderCombo();
    const search = open();

    fireEvent.change(search, { target: { value: 'a' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.keyDown(search, { key: 'a' });

    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('offers to create what is missing, with the trimmed name', () => {
    const onCrear = vi.fn();
    renderCombo({ onCrear });
    const search = open();

    fireEvent.change(search, { target: { value: '  Mascotas ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear “Mascotas”' }));

    expect(onCrear).toHaveBeenCalledWith('Mascotas');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('creates with Enter when nothing matches', () => {
    const onCrear = vi.fn();
    renderCombo({ onCrear });
    const search = open();

    fireEvent.change(search, { target: { value: 'Mascotas' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onCrear).toHaveBeenCalledWith('Mascotas');
  });

  it('does not offer to create a name that already exists', () => {
    renderCombo({ onCrear: vi.fn() });
    const search = open();

    fireEvent.change(search, { target: { value: 'aseo' } });

    expect(screen.queryByRole('button', { name: /Crear/ })).toBeNull();
  });

  it('disables the create button while creating', () => {
    renderCombo({ onCrear: vi.fn(), creando: true });
    const search = open();

    fireEvent.change(search, { target: { value: 'Mascotas' } });

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Crear “Mascotas”' }).disabled,
    ).toBe(true);
  });

  it('keeps showing the chosen option while disabled, and cannot be opened', () => {
    renderCombo({ valor: '1', deshabilitado: true, id: 'concepto' });

    expect(screen.queryByRole('button')).toBeNull();
    const field = screen.getByText('Aseo').closest('[aria-disabled="true"]');
    expect(field?.id).toBe('concepto');
  });
});
