import { describe, expect, it } from 'vitest';

import { categoryChanges, categoryModalTexts, newCategory } from './category-form';

const CENTER = { isCostCenter: true, name: '  Negocio ', isStatic: true, icon: 'house' };
const CATEGORY = { isCostCenter: false, name: ' Transporte ', isStatic: true, icon: 'car' };

describe('categoryChanges', () => {
  it('saves the name and the static flag of a cost center, not its icon', () => {
    expect(categoryChanges(CENTER)).toEqual({ name: 'Negocio', isStatic: true });
  });

  it('saves the name and the icon of a category, not the static flag', () => {
    expect(categoryChanges(CATEGORY)).toEqual({ name: 'Transporte', icon: 'car' });
  });

  it('clears the icon of a category when none is chosen', () => {
    expect(categoryChanges({ ...CATEGORY, icon: null })).toEqual({
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
    expect(newCategory({ ...CATEGORY, icon: null }, undefined)).toEqual({
      name: 'Transporte',
      kind: 'expense',
    });
  });
});

describe('categoryModalTexts', () => {
  it('titles a cost center as new or edited', () => {
    expect(categoryModalTexts(true, false).title).toBe('Nuevo centro de costos');
    expect(categoryModalTexts(true, true).title).toBe('Editar centro de costos');
    expect(categoryModalTexts(true, false).help).toMatch(/más general/);
  });

  it('titles a category as new or edited', () => {
    expect(categoryModalTexts(false, false).title).toBe('Nueva categoría');
    expect(categoryModalTexts(false, true).title).toBe('Editar categoría');
    expect(categoryModalTexts(false, true).help).toMatch(/de en medio/);
  });
});
