import { describe, expect, it } from 'vitest';

import { categoryChanges, categoryModalTexts, newCategory } from './category-form';

const CENTER = { esCentro: true, nombre: '  Negocio ', estatico: true, icono: 'house' };
const CATEGORY = { esCentro: false, nombre: ' Transporte ', estatico: true, icono: 'car' };

describe('categoryChanges', () => {
  it('saves the name and the static flag of a cost center, not its icon', () => {
    expect(categoryChanges(CENTER)).toEqual({ name: 'Negocio', isStatic: true });
  });

  it('saves the name and the icon of a category, not the static flag', () => {
    expect(categoryChanges(CATEGORY)).toEqual({ name: 'Transporte', icon: 'car' });
  });

  it('clears the icon of a category when none is chosen', () => {
    expect(categoryChanges({ ...CATEGORY, icono: null })).toEqual({
      name: 'Transporte',
      icon: null,
    });
  });
});

describe('newCategory', () => {
  it('creates a cost center with its static flag and no parent', () => {
    expect(newCategory(CENTER, 7)).toEqual({ name: 'Negocio', kind: 'expense', isStatic: true });
  });

  it('creates a category under its parent with its icon', () => {
    expect(newCategory(CATEGORY, 7)).toEqual({
      name: 'Transporte',
      kind: 'expense',
      parentId: 7,
      icon: 'car',
    });
  });

  it('leaves out the parent and the icon when there are none', () => {
    expect(newCategory({ ...CATEGORY, icono: null }, undefined)).toEqual({
      name: 'Transporte',
      kind: 'expense',
    });
  });
});

describe('categoryModalTexts', () => {
  it('titles a cost center as new or edited', () => {
    expect(categoryModalTexts(true, false).titulo).toBe('Nuevo centro de costos');
    expect(categoryModalTexts(true, true).titulo).toBe('Editar centro de costos');
    expect(categoryModalTexts(true, false).ayuda).toMatch(/más general/);
  });

  it('titles a category as new or edited', () => {
    expect(categoryModalTexts(false, false).titulo).toBe('Nueva categoría');
    expect(categoryModalTexts(false, true).titulo).toBe('Editar categoría');
    expect(categoryModalTexts(false, true).ayuda).toMatch(/de en medio/);
  });
});
