// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NodoBuscable } from '@coco/lectura';

import { BuscadorDeConcepto } from './buscador-de-concepto';

/**
 * El buscador que reemplaza a la cascada.
 *
 * Lo que el plan pide probar, uno por uno: encuentra por nombre y por palabra
 * clave sin importar tildes ni mayúsculas; enseña la ruta de cada resultado;
 * elegir un concepto o una categoría avisa con su id; «Crear concepto» pide
 * solo la categoría.
 */
afterEach(cleanup);

const ARBOL: NodoBuscable[] = [
  {
    id: 1,
    name: 'Costos fijos',
    children: [
      {
        id: 10,
        name: 'Servicios públicos',
        children: [{ id: 100, name: 'Celsia (Energía)', palabras_clave: ['celsia'] }],
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
          { id: 200, name: 'Mercado', palabras_clave: ['D1', 'Koba'] },
          { id: 201, name: 'Supermercado' },
        ],
      },
    ],
  },
];

function pintar(props: Partial<Parameters<typeof BuscadorDeConcepto>[0]> = {}) {
  const onElegir = vi.fn();
  const onCrearConcepto = vi.fn();
  render(
    <BuscadorDeConcepto
      id="concepto"
      arbol={ARBOL}
      valor={undefined}
      onElegir={onElegir}
      onCrearConcepto={onCrearConcepto}
      {...props}
    />,
  );
  return { onElegir, onCrearConcepto };
}

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Concepto/ }));
const escribir = (texto: string) =>
  fireEvent.change(screen.getByLabelText('Buscar concepto o categoría'), {
    target: { value: texto },
  });
const opcion = (nombre: RegExp) => screen.getByRole('option', { name: nombre });

describe('Buscar', () => {
  it('encuentra por nombre, sin tildes ni mayúsculas', () => {
    pintar();
    abrir();
    escribir('EDUCACION');
    expect(opcion(/^Educación/)).toBeDefined();
  });

  it('encuentra por palabra clave: «d1» es Mercado', () => {
    pintar();
    abrir();
    escribir('d1');
    expect(opcion(/^Mercado/)).toBeDefined();
    expect(screen.queryByRole('option', { name: /^Supermercado/ })).toBeNull();
  });

  it('cada resultado enseña su ruta, que es lo que distingue dos nombres parecidos', () => {
    pintar();
    abrir();
    escribir('mercado');
    expect(opcion(/^Mercado/).textContent).toContain('Alimentación › Costos variables');
  });

  it('una categoría se marca como tal', () => {
    pintar();
    abrir();
    escribir('alimentacion');
    const fila = opcion(/^Alimentación/);
    expect(fila.textContent).toContain('categoría');
    expect(fila.textContent).toContain('Costos variables');
  });
});

describe('Elegir', () => {
  it('un concepto avisa con su id: con él se completan categoría y centro', () => {
    const { onElegir } = pintar();
    abrir();
    escribir('celsia');
    fireEvent.click(opcion(/^Celsia/));
    expect(onElegir).toHaveBeenCalledWith(100);
  });

  it('una categoría también vale: hay cuentas con categorías y sin conceptos', () => {
    const { onElegir } = pintar();
    abrir();
    escribir('educacion');
    fireEvent.click(opcion(/^Educación/));
    expect(onElegir).toHaveBeenCalledWith(11);
  });

  it('Enter elige lo único que queda', () => {
    const { onElegir } = pintar();
    abrir();
    escribir('celsia');
    fireEvent.keyDown(screen.getByLabelText('Buscar concepto o categoría'), { key: 'Enter' });
    expect(onElegir).toHaveBeenCalledWith(100);
  });

  it('lo elegido se lee en el campo con su ruta, y se puede quitar', () => {
    const { onElegir } = pintar({ valor: 200 });
    expect(screen.getByRole('button', { name: /Concepto/ }).textContent).toContain('Mercado');
    abrir();
    fireEvent.click(opcion(/Quitar/));
    expect(onElegir).toHaveBeenCalledWith(undefined);
  });
});

describe('Crear lo que no existe', () => {
  it('ofrece crear el concepto con lo escrito y pide SOLO la categoría', () => {
    const { onCrearConcepto } = pintar();
    abrir();
    escribir('Gimnasio');
    expect(screen.queryByRole('option')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Crear concepto «Gimnasio»/ }));
    // Ahora se pregunta en qué categoría va: las categorías, y nada más.
    expect(screen.getByText(/¿En qué categoría va «Gimnasio»\?/)).toBeDefined();
    expect(screen.queryByRole('option', { name: /^Celsia/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /^Costos fijos/ })).toBeNull();

    fireEvent.click(opcion(/^Alimentación/));
    expect(onCrearConcepto).toHaveBeenCalledWith('Gimnasio', 20);
  });

  it('no ofrece crear lo que ya existe con ese nombre', () => {
    pintar();
    abrir();
    escribir('Mercado');
    expect(screen.queryByRole('button', { name: /Crear concepto/ })).toBeNull();
  });
});

describe('Con el buscador en blanco', () => {
  it('enseña los recientes, hasta cinco', () => {
    pintar({ recientes: [201, 100, 200, 201] });
    abrir();
    expect(screen.getByText('Recientes')).toBeDefined();
    const nombres = screen.getAllByRole('option').map((o) => o.textContent);
    expect(nombres[0]).toContain('Supermercado');
    expect(nombres[1]).toContain('Celsia');
    expect(nombres[2]).toContain('Mercado');
    expect(nombres).toHaveLength(3);
  });

  it('si el recibo dejó candidatos, van ellos primero, con su ruta', () => {
    const { onElegir } = pintar({
      candidatos: [
        { id: 200, nombre: 'Mercado', ruta: 'Alimentación › Costos variables' },
        { id: 201, nombre: 'Supermercado', ruta: 'Alimentación › Costos variables' },
      ],
      recientes: [100],
    });
    abrir();
    expect(screen.getByText('Del recibo')).toBeDefined();
    expect(screen.queryByText('Recientes')).toBeNull();
    fireEvent.click(opcion(/^Supermercado/));
    expect(onElegir).toHaveBeenCalledWith(201);
  });
});

describe('En un centro estático', () => {
  it('se lee lo elegido pero no se puede cambiar', () => {
    pintar({ valor: 100, deshabilitado: true });
    const campo = screen.getByText(/Celsia/).closest('[aria-disabled="true"]');
    expect(campo).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Concepto/ })).toBeNull();
  });
});
