import { describe, expect, it } from 'vitest';

import {
  searchInTree,
  indexTree,
  resolveTerms,
  readablePath,
  type SearchableNode,
} from '@coco/receipt-parser';

/**
 * El buscador sobre el árbol de alguien.
 *
 * Vive en `@coco/receipt-parser` y se prueba desde aquí como el resto del paquete:
 * es lo que usa la ficha para encontrar un concepto en dos letras, y lo que
 * usa el diccionario para traducir «d1» a lo que esa persona llame mercado.
 */
const ARBOL: SearchableNode[] = [
  {
    id: 1,
    name: 'Costos fijos',
    children: [
      {
        id: 10,
        name: 'Servicios públicos',
        children: [
          { id: 100, name: 'Celsia (Energía)', keywords: ['celsia', 'epsa'] },
          { id: 101, name: 'Aquaoccidente (Agua)', keywords: ['acueducto'] },
        ],
      },
      {
        id: 11,
        name: 'Educación',
        children: [{ id: 110, name: 'Colegio Tuti' }],
      },
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
          { id: 200, name: 'Mercado', keywords: ['D1', 'Koba Colombia', 'Ara'] },
          { id: 201, name: 'Supermercado' },
        ],
      },
      { id: 21, name: 'Transporte', children: [] },
    ],
  },
];

const indice = indexTree(ARBOL);

describe('Indexar el árbol', () => {
  it('aplana los tres niveles con su camino', () => {
    const mercado = indice.find((e) => e.id === 200)!;
    expect(mercado.level).toBe('concepto');
    expect(mercado.path).toEqual(['Alimentación', 'Costos variables']);
    expect(mercado.categoryId).toBe(20);
    expect(mercado.costCenterId).toBe(2);
    expect(readablePath(mercado)).toBe('Alimentación › Costos variables');
  });

  it('una categoría solo lleva su centro en el camino', () => {
    const alimentacion = indice.find((e) => e.id === 20)!;
    expect(alimentacion.level).toBe('categoria');
    expect(alimentacion.path).toEqual(['Costos variables']);
  });
});

describe('Buscar', () => {
  it('encuentra por nombre, sin tildes ni mayúsculas', () => {
    expect(searchInTree(indice, 'educacion').map((e) => e.name)).toEqual(['Educación']);
    expect(searchInTree(indice, 'CELSIA').map((e) => e.id)).toEqual([100]);
  });

  it('encuentra por palabra clave: «d1» es Mercado', () => {
    // Es la razón de que exista: lo que dice el recibo no es el nombre del
    // concepto, es lo que alguien escribió como palabra clave.
    expect(searchInTree(indice, 'd1').map((e) => e.id)).toEqual([200]);
    expect(searchInTree(indice, 'koba').map((e) => e.id)).toEqual([200]);
  });

  it('el nombre exacto gana al que empieza igual, y ese al que lo contiene', () => {
    const nombres = searchInTree(indice, 'mercado').map((e) => e.name);
    expect(nombres).toEqual(['Mercado', 'Supermercado']);
  });

  it('a igual parecido, el concepto antes que la categoría', () => {
    // «Transporte» es una categoría; si hubiera un concepto igual, iría antes.
    const conConcepto = indexTree([
      {
        id: 3,
        name: 'Centro',
        children: [{ id: 30, name: 'Transporte', children: [{ id: 300, name: 'Transporte' }] }],
      },
    ]);
    expect(searchInTree(conConcepto, 'transporte').map((e) => e.level)).toEqual([
      'concepto',
      'categoria',
    ]);
  });

  it('con varias palabras, todas tienen que encontrarse', () => {
    // «mercado d1» no puede traer Supermercado solo porque diga «mercado».
    expect(searchInTree(indice, 'mercado d1').map((e) => e.id)).toEqual([200]);
    expect(searchInTree(indice, 'mercado zzz')).toEqual([]);
  });

  it('vacío devuelve vacío: los recientes los pone quien llama', () => {
    expect(searchInTree(indice, '')).toEqual([]);
    expect(searchInTree(indice, '   ')).toEqual([]);
  });

  it('no devuelve centros de costos: elegir uno no clasifica nada', () => {
    expect(searchInTree(indice, 'costos')).toEqual([]);
    expect(searchInTree(indice, 'costos', { levels: ['centro'] }).map((e) => e.name)).toEqual([
      'Costos fijos',
      'Costos variables',
    ]);
  });
});

describe('Resolver términos genéricos (lo que usa el diccionario)', () => {
  it('ALTA cuando los términos llevan a un solo concepto', () => {
    const r = resolveTerms(indice, ['acueducto', 'agua']);
    expect(r.certainty).toBe('alta');
    expect(r.concept?.id).toBe(101);
  });

  it('MEDIA cuando llevan a varios conceptos: propone su categoría común', () => {
    // «mercado» y «supermercado» son dos conceptos de la misma cuenta. Elegir
    // uno sería mover plata a un sitio que nadie pidió.
    const r = resolveTerms(indice, ['mercado', 'supermercado']);
    expect(r.certainty).toBe('media');
    expect(r.concept).toBeUndefined();
    expect(r.category?.id).toBe(20);
    expect(r.candidates.map((c) => c.id).sort()).toEqual([200, 201]);
  });

  it('MEDIA cuando llevan a una categoría y a ningún concepto', () => {
    // Quien tiene «Transporte» como categoría vacía: se propone la categoría.
    const r = resolveTerms(indice, ['transporte', 'taxi']);
    expect(r.certainty).toBe('media');
    expect(r.category?.id).toBe(21);
    expect(r.candidates.map((c) => c.id)).toEqual([21]);
  });

  it('MEDIA con varios conceptos de categorías distintas: no propone ninguna', () => {
    const r = resolveTerms(indice, ['celsia', 'mercado']);
    expect(r.certainty).toBe('media');
    expect(r.category).toBeUndefined();
    expect(r.candidates.length).toBeGreaterThan(1);
  });

  it('NINGUNA cuando no llevan a nada', () => {
    const r = resolveTerms(indice, ['gasolina', 'combustible']);
    expect(r.certainty).toBe('ninguna');
    expect(r.candidates).toEqual([]);
  });
});
