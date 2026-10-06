import { describe, expect, it } from 'vitest';

import { type CategoryTree } from '@/shared/api/categories';
import { classify, SIGNATURES } from '@coco/receipt-parser';

import {
  conceptoQueYaLaUsa,
  firmasDelArbol,
  LARGO_MINIMO,
  MAXIMO_DE_PALABRAS,
  partir,
  porQueNoEntra,
  yaEsta,
} from './palabras-clave';

/** Un concepto de mentira, con lo mínimo que mira el código de aquí. */
function concepto(id: number, name: string, palabras: string[] = []): CategoryTree {
  return {
    id,
    name,
    parentId: null,
    kind: 'expense',
    color: null,
    icon: null,
    sortOrder: 0,
    isArchived: false,
    isRecurring: false,
    periodicity: null,
    paymentDay: null,
    paymentMonth: null,
    isStatic: false,
    keywords: palabras,
  } as CategoryTree;
}

/** Centro → categoría → concepto, que es la forma que tiene el árbol de verdad. */
function arbolCon(...conceptos: CategoryTree[]): CategoryTree[] {
  const categoria = { ...concepto(20, 'Servicios públicos'), children: conceptos };
  return [{ ...concepto(10, 'Costos fijos'), children: [categoria] }];
}

describe('Lo que se escribe, antes de guardarse', () => {
  it('parte por comas y por saltos de línea, y tira lo vacío', () => {
    expect(partir('Celsia, EPSA\n 805027653 ,, ')).toEqual(['Celsia', 'EPSA', '805027653']);
  });

  it('una palabra repetida lo es aunque cambien las tildes y las mayúsculas', () => {
    expect(yaEsta(['Aquaoccidente'], 'AQUAOCCIDENTE')).toBe(true);
    expect(yaEsta(['Energía'], 'energia')).toBe(true);
    expect(yaEsta(['Celsia'], 'EPSA')).toBe(false);
  });

  it('rechaza lo que reconocería cualquier recibo, lo repetido y lo que no cabe', () => {
    // Dos letras aparecen DENTRO de otras palabras: "ao" está en "pago".
    expect(porQueNoEntra('ao', [])).toContain(String(LARGO_MINIMO));
    expect(porQueNoEntra('Celsia', ['celsia'])).toContain('ya está');
    expect(porQueNoEntra('x'.repeat(70), [])).toContain('muy larga');

    const llena = Array.from({ length: MAXIMO_DE_PALABRAS }, (_, i) => `palabra${i}`);
    expect(porQueNoEntra('Celsia', llena)).toContain(String(MAXIMO_DE_PALABRAS));
  });

  it('deja pasar lo que sirve', () => {
    expect(porQueNoEntra('Comfandi', ['Celsia'])).toBeNull();
    expect(porQueNoEntra('805027653', [])).toBeNull();
  });
});

describe('Una palabra en dos conceptos se avisa, no se prohíbe', () => {
  const arbol = arbolCon(concepto(1, 'Energía', ['Celsia']), concepto(2, 'Internet', ['fibra']));

  it('dice cuál es el otro concepto que ya la usa', () => {
    expect(conceptoQueYaLaUsa(arbol, 'celsia')?.name).toBe('Energía');
  });

  it('no se avisa a sí mismo', () => {
    expect(conceptoQueYaLaUsa(arbol, 'Celsia', 1)).toBeUndefined();
  });

  it('calla cuando nadie más la usa', () => {
    expect(conceptoQueYaLaUsa(arbol, 'Comfandi')).toBeUndefined();
  });
});

describe('Las palabras clave clasifican un soporte', () => {
  /** Como lo arma `leerSoporte`: lo escrito delante, el catálogo detrás. */
  const conElArbol = (arbol: CategoryTree[]) => [...firmasDelArbol(arbol), ...SIGNATURES];

  it('un concepto sin palabras no produce firma', () => {
    expect(firmasDelArbol(arbolCon(concepto(1, 'Energía')))).toEqual([]);
  });

  it('reconoce un acreedor que el catálogo no conoce', () => {
    const arbol = arbolCon(concepto(1, 'Arriendo oficina', ['Inmobiliaria del Valle']));

    const lectura = classify({
      texto: 'INMOBILIARIA DEL VALLE S.A.S.\nCanon de arrendamiento\nTotal a pagar $1.200.000',
      fuente: 'texto-embebido',
      firmas: conElArbol(arbol),
    });

    expect(lectura.concepto).toBe('Arriendo oficina');
    expect(lectura.valor).toBe(1_200_000);
  });

  it('lo encuentra también en el nombre del archivo, que es lo que queda de un escaneo malo', () => {
    const arbol = arbolCon(concepto(1, 'Colegio', ['Comfandi']));

    const lectura = classify({
      // El reconocimiento no sacó nada útil del papel.
      texto: 'recibo de caja  ****  ',
      fuente: 'ocr',
      nombreDeArchivo: 'comfandi agosto',
      firmas: conElArbol(arbol),
    });

    expect(lectura.concepto).toBe('Colegio');
  });

  it('lo escrito por una persona le gana al catálogo', () => {
    // El catálogo reconoce "celsia" como «Celsia (Energia)». Si alguien puso
    // esa misma palabra en SU concepto, manda el suyo.
    const arbol = arbolCon(concepto(1, 'Luz de la casa', ['Celsia']));

    const lectura = classify({
      texto: 'CELSIA S.A. E.S.P.\nFactura de energía\nTotal a pagar $180.000',
      fuente: 'texto-embebido',
      firmas: conElArbol(arbol),
    });

    expect(lectura.concepto).toBe('Luz de la casa');
    // Ganar por prioridad y no por puntos es una duda, pero no puede dejar la
    // confianza por los suelos: el valor se leyó de una línea de total.
    expect(lectura.confianza).toBeGreaterThan(0.4);
  });

  it('sin palabras clave, el catálogo sigue mandando', () => {
    const lectura = classify({
      texto: 'CELSIA S.A. E.S.P.\nFactura de energía\nTotal a pagar $180.000',
      fuente: 'texto-embebido',
      firmas: conElArbol(arbolCon(concepto(1, 'Energía'))),
    });

    expect(lectura.concepto).toBe('Celsia (Energia)');
  });
});
