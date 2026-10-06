// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TreeNode } from '@/shared/lib/searchable-tree';

import { ConceptSearch } from './concept-search';

/**
 * El buscador que reemplaza a la cascada.
 *
 * Lo que el plan pide probar, uno por uno: encuentra por nombre y por palabra
 * clave sin importar tildes ni mayúsculas; enseña la ruta de cada resultado;
 * elegir un concepto o una categoría avisa con su id; «Crear concepto» pide
 * solo la categoría.
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

describe('Buscar', () => {
  it('encuentra por nombre, sin tildes ni mayúsculas', () => {
    renderSearch();
    open();
    type('EDUCACION');
    expect(option(/^Educación/)).toBeDefined();
  });

  it('encuentra por palabra clave: «d1» es Mercado', () => {
    renderSearch();
    open();
    type('d1');
    expect(option(/^Mercado/)).toBeDefined();
    expect(screen.queryByRole('option', { name: /^Supermercado/ })).toBeNull();
  });

  it('cada resultado enseña su ruta, que es lo que distingue dos nombres parecidos', () => {
    renderSearch();
    open();
    type('mercado');
    expect(option(/^Mercado/).textContent).toContain('Alimentación › Costos variables');
  });

  it('una categoría se marca como tal', () => {
    renderSearch();
    open();
    type('alimentacion');
    const row = option(/^Alimentación/);
    expect(row.textContent).toContain('categoría');
    expect(row.textContent).toContain('Costos variables');
  });
});

describe('Elegir', () => {
  it('un concepto avisa con su id: con él se completan categoría y centro', () => {
    const { onSelect } = renderSearch();
    open();
    type('celsia');
    fireEvent.click(option(/^Celsia/));
    expect(onSelect).toHaveBeenCalledWith(100);
  });

  it('una categoría también vale: hay cuentas con categorías y sin conceptos', () => {
    const { onSelect } = renderSearch();
    open();
    type('educacion');
    fireEvent.click(option(/^Educación/));
    expect(onSelect).toHaveBeenCalledWith(11);
  });

  it('Enter elige lo único que queda', () => {
    const { onSelect } = renderSearch();
    open();
    type('celsia');
    fireEvent.keyDown(screen.getByLabelText('Buscar concepto o categoría'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(100);
  });

  it('lo elegido se lee en el campo con su ruta, y se puede quitar', () => {
    const { onSelect } = renderSearch({ value: 200 });
    expect(screen.getByRole('button', { name: /Concepto/ }).textContent).toContain('Mercado');
    open();
    fireEvent.click(option(/Quitar/));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });
});

describe('Crear lo que no existe', () => {
  it('ofrece crear el concepto con lo escrito y pide SOLO la categoría', () => {
    const { onCreateConcept } = renderSearch();
    open();
    type('Gimnasio');
    expect(screen.queryByRole('option')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Crear concepto «Gimnasio»/ }));
    // Ahora se pregunta en qué categoría va: las categorías, y nada más.
    expect(screen.getByText(/¿En qué categoría va «Gimnasio»\?/)).toBeDefined();
    expect(screen.queryByRole('option', { name: /^Celsia/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /^Costos fijos/ })).toBeNull();

    fireEvent.click(option(/^Alimentación/));
    expect(onCreateConcept).toHaveBeenCalledWith('Gimnasio', 20);
  });

  it('no ofrece crear lo que ya existe con ese nombre', () => {
    renderSearch();
    open();
    type('Mercado');
    expect(screen.queryByRole('button', { name: /Crear concepto/ })).toBeNull();
  });
});

describe('Con el buscador en blanco', () => {
  it('enseña los recientes, hasta cinco', () => {
    renderSearch({ recent: [201, 100, 200, 201] });
    open();
    expect(screen.getByText('Recientes')).toBeDefined();
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names[0]).toContain('Supermercado');
    expect(names[1]).toContain('Celsia');
    expect(names[2]).toContain('Mercado');
    expect(names).toHaveLength(3);
  });

  it('si el recibo dejó candidatos, van ellos primero, con su ruta', () => {
    const { onSelect } = renderSearch({
      candidates: [
        { id: 200, nombre: 'Mercado', ruta: 'Alimentación › Costos variables' },
        { id: 201, nombre: 'Supermercado', ruta: 'Alimentación › Costos variables' },
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

describe('En un centro estático', () => {
  it('se lee lo elegido pero no se puede cambiar', () => {
    renderSearch({ value: 100, disabled: true });
    const field = screen.getByText(/Celsia/).closest('[aria-disabled="true"]');
    expect(field).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Concepto/ })).toBeNull();
  });
});

/*
  La estructura ARIA, que axe vigila en los recorridos: el panel es un
  diálogo (lleva una caja de texto y botones, que una lista no puede
  contener) y de cada lista cuelgan solo opciones, directas o en un grupo.
*/
describe('Estructura accesible', () => {
  /** Lo que cuelga de una lista tiene que ser una opción o un grupo de opciones. */
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

  it('el panel es un diálogo con la caja de búsqueda y una lista de opciones', () => {
    renderSearch();
    open();
    const trigger = screen.getByRole('button', { name: /Concepto/ });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    const panel = screen.getByRole('dialog', { name: 'Concepto' });
    expect(panel.querySelector('[role="listbox"] input')).toBeNull();

    type('mercado');
    optionsOnly(screen.getByRole('listbox', { name: 'Resultados' }));
  });

  it('los recientes van en un grupo con nombre', () => {
    renderSearch({ recent: [200] });
    open();
    optionsOnly(screen.getByRole('listbox', { name: 'Resultados' }));
    expect(screen.getByRole('group', { name: 'Recientes' })).toBeDefined();
  });

  it('sin nada que ofrecer no hay lista: lo vacío se dice fuera de ella', () => {
    renderSearch();
    open();
    type('zzz');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('la lista de categorías para crear también lleva solo opciones', () => {
    renderSearch({ onCreateConcept: vi.fn() });
    open();
    type('Gimnasio');
    fireEvent.click(screen.getByRole('button', { name: /Crear concepto «Gimnasio»/ }));
    optionsOnly(screen.getByRole('listbox', { name: 'Categorías' }));
  });
});
