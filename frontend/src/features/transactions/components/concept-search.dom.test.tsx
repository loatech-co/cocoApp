// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TreeNode } from '@/shared/lib/searchable-tree';

import { ConceptSearch } from './concept-search';

/**
 * The search that replaces the cascade.
 *
 * What the plan asks to test, one by one: it finds by name and by
 * keyword regardless of accents or capitals; it shows each result's path;
 * picking a concept or a category reports its id; «Crear concepto» asks
 * only for the category.
 */
afterEach(cleanup);

const TREE: TreeNode[] = [
  {
    id: 1,
    name: 'Costos fijos',
    children: [
      {
        id: 10,
        name: 'Servicios públicos',
        children: [{ id: 100, name: 'Celsia (Energía)', keywords: ['celsia'] }],
      },
      { id: 11, name: 'Educación', children: [] },
    ],
  },
  {
    id: 2,
    name: 'Costos variables',
    children: [
      {
        id: 20,
        name: 'Alimentación',
        children: [
          { id: 200, name: 'Mercado', keywords: ['D1', 'Koba'] },
          { id: 201, name: 'Supermercado' },
        ],
      },
    ],
  },
];

function renderSearch(props: Partial<Parameters<typeof ConceptSearch>[0]> = {}) {
  const onSelect = vi.fn();
  const onCreateConcept = vi.fn();
  render(
    <ConceptSearch
      id="concepto"
      tree={TREE}
      value={undefined}
      onSelect={onSelect}
      onCreateConcept={onCreateConcept}
      {...props}
    />,
  );
  return { onSelect, onCreateConcept };
}

const open = () => fireEvent.click(screen.getByRole('button', { name: /Concepto/ }));
const type = (text: string) =>
  fireEvent.change(screen.getByLabelText('Buscar concepto o categoría'), {
    target: { value: text },
  });
const option = (name: RegExp) => screen.getByRole('option', { name });

describe('Search', () => {
  it('finds by name, regardless of accents or capitals', () => {
    renderSearch();
    open();
    type('EDUCACION');
    expect(option(/^Educación/)).toBeDefined();
  });

  it('finds by keyword: «d1» is Mercado', () => {
    renderSearch();
    open();
    type('d1');
    expect(option(/^Mercado/)).toBeDefined();
    expect(screen.queryByRole('option', { name: /^Supermercado/ })).toBeNull();
  });

  it('each result shows its path, which is what tells two similar names apart', () => {
    renderSearch();
    open();
    type('mercado');
    expect(option(/^Mercado/).textContent).toContain('Alimentación › Costos variables');
  });

  it('a category is marked as such', () => {
    renderSearch();
    open();
    type('alimentacion');
    const row = option(/^Alimentación/);
    expect(row.textContent).toContain('categoría');
    expect(row.textContent).toContain('Costos variables');
  });
});

describe('Select', () => {
  it('a concept reports its id: with it the category and center are completed', () => {
    const { onSelect } = renderSearch();
    open();
    type('celsia');
    fireEvent.click(option(/^Celsia/));
    expect(onSelect).toHaveBeenCalledWith(100);
  });

  it('a category is valid too: there are accounts with categories and no concepts', () => {
    const { onSelect } = renderSearch();
    open();
    type('educacion');
    fireEvent.click(option(/^Educación/));
    expect(onSelect).toHaveBeenCalledWith(11);
  });

  it('Enter picks the only thing left', () => {
    const { onSelect } = renderSearch();
    open();
    type('celsia');
    fireEvent.keyDown(screen.getByLabelText('Buscar concepto o categoría'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(100);
  });

  it('what was picked reads in the field with its path, and can be removed', () => {
    const { onSelect } = renderSearch({ value: 200 });
    expect(screen.getByRole('button', { name: /Concepto/ }).textContent).toContain('Mercado');
    open();
    fireEvent.click(option(/Quitar/));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });
});

describe('Create what does not exist', () => {
  it('offers to create the concept with what was typed and asks ONLY for the category', () => {
    const { onCreateConcept } = renderSearch();
    open();
    type('Gimnasio');
    expect(screen.queryByRole('option')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Crear concepto «Gimnasio»/ }));
    // Now it asks which category it goes in: the categories, and nothing else.
    expect(screen.getByText(/¿En qué categoría va «Gimnasio»\?/)).toBeDefined();
    expect(screen.queryByRole('option', { name: /^Celsia/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /^Costos fijos/ })).toBeNull();

    fireEvent.click(option(/^Alimentación/));
    expect(onCreateConcept).toHaveBeenCalledWith('Gimnasio', 20);
  });

  it('does not offer to create what already exists with that name', () => {
    renderSearch();
    open();
    type('Mercado');
    expect(screen.queryByRole('button', { name: /Crear concepto/ })).toBeNull();
  });
});

describe('With the search blank', () => {
  it('shows the recent ones, up to five', () => {
    renderSearch({ recent: [201, 100, 200, 201] });
    open();
    expect(screen.getByText('Recientes')).toBeDefined();
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names[0]).toContain('Supermercado');
    expect(names[1]).toContain('Celsia');
    expect(names[2]).toContain('Mercado');
    expect(names).toHaveLength(3);
  });

  it('if the receipt left candidates, they go first, with their path', () => {
    const { onSelect } = renderSearch({
      candidates: [
        { id: 200, name: 'Mercado', path: 'Alimentación › Costos variables' },
        { id: 201, name: 'Supermercado', path: 'Alimentación › Costos variables' },
      ],
      recent: [100],
    });
    open();
    expect(screen.getByText('Del recibo')).toBeDefined();
    expect(screen.queryByText('Recientes')).toBeNull();
    fireEvent.click(option(/^Supermercado/));
    expect(onSelect).toHaveBeenCalledWith(201);
  });
});

describe('In a static center', () => {
  it('what was picked can be read but not changed', () => {
    renderSearch({ value: 100, disabled: true });
    const field = screen.getByText(/Celsia/).closest('[aria-disabled="true"]');
    expect(field).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Concepto/ })).toBeNull();
  });
});

/*
  The ARIA structure, which axe watches in the walkthroughs: the panel is a
  dialog (it holds a text box and buttons, which a list cannot
  contain) and only options hang from each list, directly or in a group.
*/
describe('Accessible structure', () => {
  /** What hangs from a list has to be an option or a group of options. */
  function optionsOnly(list: HTMLElement): void {
    for (const child of Array.from(list.children)) {
      const role = child.getAttribute('role');
      expect(['option', 'group']).toContain(role);
      if (role === 'group') {
        expect(child.getAttribute('aria-labelledby')).toBeTruthy();
        for (const o of Array.from(child.children).slice(1)) {
          expect(o.getAttribute('role')).toBe('option');
        }
      }
    }
  }

  it('the panel is a dialog with the search box and a list of options', () => {
    renderSearch();
    open();
    const trigger = screen.getByRole('button', { name: /Concepto/ });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    const panel = screen.getByRole('dialog', { name: 'Concepto' });
    expect(panel.querySelector('[role="listbox"] input')).toBeNull();

    type('mercado');
    optionsOnly(screen.getByRole('listbox', { name: 'Resultados' }));
  });

  it('the recent ones go in a named group', () => {
    renderSearch({ recent: [200] });
    open();
    optionsOnly(screen.getByRole('listbox', { name: 'Resultados' }));
    expect(screen.getByRole('group', { name: 'Recientes' })).toBeDefined();
  });

  it('with nothing to offer there is no list: the empty case is said outside it', () => {
    renderSearch();
    open();
    type('zzz');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('the list of categories to create in also holds only options', () => {
    renderSearch({ onCreateConcept: vi.fn() });
    open();
    type('Gimnasio');
    fireEvent.click(screen.getByRole('button', { name: /Crear concepto «Gimnasio»/ }));
    optionsOnly(screen.getByRole('listbox', { name: 'Categorías' }));
  });
});
