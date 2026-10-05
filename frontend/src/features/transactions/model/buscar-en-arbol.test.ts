import { describe, expect, it } from 'vitest';

import {
  buscarEnArbol,
  indexarArbol,
  resolverTerminos,
  rutaLegible,
  type NodoBuscable,
} from '@coco/lectura';

/**
 * El buscador sobre el árbol de alguien.
 *
 * Vive en `@coco/lectura` y se prueba desde aquí como el resto del paquete:
 * es lo que usa la ficha para encontrar un concepto en dos letras, y lo que
 * usa el diccionario para traducir «d1» a lo que esa persona llame mercado.
 */
const ARBOL: NodoBuscable[] = [
  {
    id: 1,
    name: 'Costos fijos',
    children: [
      {
        id: 10,
        name: 'Servicios públicos',
        children: [
          { id: 100, name: 'Celsia (Energía)', palabras_clave: ['celsia', 'epsa'] },
          { id: 101, name: 'Aquaoccidente (Agua)', palabras_clave: ['acueducto'] },
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
          { id: 200, name: 'Mercado', palabras_clave: ['D1', 'Koba Colombia', 'Ara'] },
          { id: 201, name: 'Supermercado' },
        ],
      },
      { id: 21, name: 'Transporte', children: [] },
    ],
  },
];

const indice = indexarArbol(ARBOL);

describe('Indexar el árbol', () => {
  it('aplana los tres niveles con su camino', () => {
    const mercado = indice.find((e) => e.id === 200)!;
    expect(mercado.nivel).toBe('concepto');
    expect(mercado.ruta).toEqual(['Alimentación', 'Costos variables']);
    expect(mercado.categoriaId).toBe(20);
    expect(mercado.centroId).toBe(2);
    expect(rutaLegible(mercado)).toBe('Alimentación › Costos variables');
  });

  it('una categoría solo lleva su centro en el camino', () => {
    const alimentacion = indice.find((e) => e.id === 20)!;
    expect(alimentacion.nivel).toBe('categoria');
    expect(alimentacion.ruta).toEqual(['Costos variables']);
  });
});

describe('Buscar', () => {
  it('encuentra por nombre, sin tildes ni mayúsculas', () => {
    expect(buscarEnArbol(indice, 'educacion').map((e) => e.nombre)).toEqual(['Educación']);
    expect(buscarEnArbol(indice, 'CELSIA').map((e) => e.id)).toEqual([100]);
  });

  it('encuentra por palabra clave: «d1» es Mercado', () => {
    // Es la razón de que exista: lo que dice el recibo no es el nombre del
    // concepto, es lo que alguien escribió como palabra clave.
    expect(buscarEnArbol(indice, 'd1').map((e) => e.id)).toEqual([200]);
    expect(buscarEnArbol(indice, 'koba').map((e) => e.id)).toEqual([200]);
  });

  it('el nombre exacto gana al que empieza igual, y ese al que lo contiene', () => {
    const nombres = buscarEnArbol(indice, 'mercado').map((e) => e.nombre);
    expect(nombres).toEqual(['Mercado', 'Supermercado']);
  });

  it('a igual parecido, el concepto antes que la categoría', () => {
    // «Transporte» es una categoría; si hubiera un concepto igual, iría antes.
    const conConcepto = indexarArbol([
      {
        id: 3,
        name: 'Centro',
        children: [{ id: 30, name: 'Transporte', children: [{ id: 300, name: 'Transporte' }] }],
      },
    ]);
    expect(buscarEnArbol(conConcepto, 'transporte').map((e) => e.nivel)).toEqual([
      'concepto',
      'categoria',
    ]);
  });

  it('con varias palabras, todas tienen que encontrarse', () => {
    // «mercado d1» no puede traer Supermercado solo porque diga «mercado».
    expect(buscarEnArbol(indice, 'mercado d1').map((e) => e.id)).toEqual([200]);
    expect(buscarEnArbol(indice, 'mercado zzz')).toEqual([]);
  });

  it('vacío devuelve vacío: los recientes los pone quien llama', () => {
    expect(buscarEnArbol(indice, '')).toEqual([]);
    expect(buscarEnArbol(indice, '   ')).toEqual([]);
  });

  it('no devuelve centros de costos: elegir uno no clasifica nada', () => {
    expect(buscarEnArbol(indice, 'costos')).toEqual([]);
    expect(buscarEnArbol(indice, 'costos', { niveles: ['centro'] }).map((e) => e.nombre)).toEqual([
      'Costos fijos',
      'Costos variables',
    ]);
  });
});

describe('Resolver términos genéricos (lo que usa el diccionario)', () => {
  it('ALTA cuando los términos llevan a un solo concepto', () => {
    const r = resolverTerminos(indice, ['acueducto', 'agua']);
    expect(r.certeza).toBe('alta');
    expect(r.concepto?.id).toBe(101);
  });

  it('MEDIA cuando llevan a varios conceptos: propone su categoría común', () => {
    // «mercado» y «supermercado» son dos conceptos de la misma cuenta. Elegir
    // uno sería mover plata a un sitio que nadie pidió.
    const r = resolverTerminos(indice, ['mercado', 'supermercado']);
    expect(r.certeza).toBe('media');
    expect(r.concepto).toBeUndefined();
    expect(r.categoria?.id).toBe(20);
    expect(r.candidatos.map((c) => c.id).sort()).toEqual([200, 201]);
  });

  it('MEDIA cuando llevan a una categoría y a ningún concepto', () => {
    // Quien tiene «Transporte» como categoría vacía: se propone la categoría.
    const r = resolverTerminos(indice, ['transporte', 'taxi']);
    expect(r.certeza).toBe('media');
    expect(r.categoria?.id).toBe(21);
    expect(r.candidatos.map((c) => c.id)).toEqual([21]);
  });

  it('MEDIA con varios conceptos de categorías distintas: no propone ninguna', () => {
    const r = resolverTerminos(indice, ['celsia', 'mercado']);
    expect(r.certeza).toBe('media');
    expect(r.categoria).toBeUndefined();
    expect(r.candidatos.length).toBeGreaterThan(1);
  });

  it('NINGUNA cuando no llevan a nada', () => {
    const r = resolverTerminos(indice, ['gasolina', 'combustible']);
    expect(r.certeza).toBe('ninguna');
    expect(r.candidatos).toEqual([]);
  });
});
