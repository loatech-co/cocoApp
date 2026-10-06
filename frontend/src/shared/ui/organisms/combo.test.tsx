// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Combo } from './combo';

afterEach(cleanup);

const OPTIONS = [
  { value: '1', label: 'Aseo' },
  { value: '2', label: 'Alimentación' },
  { value: '3', label: 'Transporte' },
];

function renderCombo(props: Partial<Parameters<typeof Combo>[0]> = {}) {
  const onChange = vi.fn();
  render(<Combo label="Concepto" value="" options={OPTIONS} onChange={onChange} {...props} />);
  return { onChange };
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
    renderCombo({ value: '3' });

    expect(screen.getByRole('button', { name: /Transporte/ })).toBeTruthy();
  });

  it('opens a listbox with every option plus the empty one', () => {
    renderCombo({ value: '1' });

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
    const { onChange } = renderCombo();
    open();

    fireEvent.click(screen.getByRole('option', { name: 'Transporte' }));

    expect(onChange).toHaveBeenCalledWith('3');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clears the choice with the empty option', () => {
    const { onChange } = renderCombo({ value: '2' });
    open(/Alimentación/);

    fireEvent.click(screen.getByRole('option', { name: 'Sin elegir' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('chooses the only match with Enter', () => {
    const { onChange } = renderCombo();
    const search = open();

    fireEvent.change(search, { target: { value: 'tra' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('3');
  });

  it('does nothing on Enter when several options match and nothing can be created', () => {
    const { onChange } = renderCombo();
    const search = open();

    fireEvent.change(search, { target: { value: 'a' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.keyDown(search, { key: 'a' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('offers to create what is missing, with the trimmed name', () => {
    const onCreate = vi.fn();
    renderCombo({ onCreate });
    const search = open();

    fireEvent.change(search, { target: { value: '  Mascotas ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear “Mascotas”' }));

    expect(onCreate).toHaveBeenCalledWith('Mascotas');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('creates with Enter when nothing matches', () => {
    const onCreate = vi.fn();
    renderCombo({ onCreate });
    const search = open();

    fireEvent.change(search, { target: { value: 'Mascotas' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledWith('Mascotas');
  });

  it('does not offer to create a name that already exists', () => {
    renderCombo({ onCreate: vi.fn() });
    const search = open();

    fireEvent.change(search, { target: { value: 'aseo' } });

    expect(screen.queryByRole('button', { name: /Crear/ })).toBeNull();
  });

  it('disables the create button while creating', () => {
    renderCombo({ onCreate: vi.fn(), isCreating: true });
    const search = open();

    fireEvent.change(search, { target: { value: 'Mascotas' } });

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Crear “Mascotas”' }).disabled,
    ).toBe(true);
  });

  it('keeps showing the chosen option while disabled, and cannot be opened', () => {
    renderCombo({ value: '1', disabled: true, id: 'concepto' });

    expect(screen.queryByRole('button')).toBeNull();
    const field = screen.getByText('Aseo').closest('[aria-disabled="true"]');
    expect(field?.id).toBe('concepto');
  });
});
