import { describe, expect, it } from 'vitest';

import { type CategoryTree } from '@/shared/api/categories';
import { classify, SIGNATURES } from '@coco/receipt-parser';

import {
  conceptAlreadyUsing,
  treeSignatures,
  MIN_LENGTH,
  MAX_KEYWORDS,
  splitKeywords,
  rejectionReason,
  includesKeyword,
} from './keywords';

/** Un concepto de mentira, con lo mínimo que mira el código de aquí. */
function concept(id: number, name: string, keywords: string[] = []): CategoryTree {
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
    keywords,
  } as CategoryTree;
}

/** Centro → categoría → concepto, que es la forma que tiene el árbol de verdad. */
function treeWith(...concepts: CategoryTree[]): CategoryTree[] {
  const category = { ...concept(20, 'Servicios públicos'), children: concepts };
  return [{ ...concept(10, 'Costos fijos'), children: [category] }];
}

describe('Lo que se escribe, antes de guardarse', () => {
  it('parte por comas y por saltos de línea, y tira lo vacío', () => {
    expect(splitKeywords('Celsia, EPSA\n 805027653 ,, ')).toEqual(['Celsia', 'EPSA', '805027653']);
  });

  it('una palabra repetida lo es aunque cambien las tildes y las mayúsculas', () => {
    expect(includesKeyword(['Aquaoccidente'], 'AQUAOCCIDENTE')).toBe(true);
    expect(includesKeyword(['Energía'], 'energia')).toBe(true);
    expect(includesKeyword(['Celsia'], 'EPSA')).toBe(false);
  });

  it('rechaza lo que reconocería cualquier recibo, lo repetido y lo que no cabe', () => {
    // Dos letras aparecen DENTRO de otras palabras: "ao" está en "pago".
    expect(rejectionReason('ao', [])).toContain(String(MIN_LENGTH));
    expect(rejectionReason('Celsia', ['celsia'])).toContain('ya está');
    expect(rejectionReason('x'.repeat(70), [])).toContain('muy larga');

    const full = Array.from({ length: MAX_KEYWORDS }, (_, i) => `palabra${i}`);
    expect(rejectionReason('Celsia', full)).toContain(String(MAX_KEYWORDS));
  });

  it('deja pasar lo que sirve', () => {
    expect(rejectionReason('Comfandi', ['Celsia'])).toBeNull();
    expect(rejectionReason('805027653', [])).toBeNull();
  });
});

describe('Una palabra en dos conceptos se avisa, no se prohíbe', () => {
  const tree = treeWith(concept(1, 'Energía', ['Celsia']), concept(2, 'Internet', ['fibra']));

  it('dice cuál es el otro concepto que ya la usa', () => {
    expect(conceptAlreadyUsing(tree, 'celsia')?.name).toBe('Energía');
  });

  it('no se avisa a sí mismo', () => {
    expect(conceptAlreadyUsing(tree, 'Celsia', 1)).toBeUndefined();
  });

  it('calla cuando nadie más la usa', () => {
    expect(conceptAlreadyUsing(tree, 'Comfandi')).toBeUndefined();
  });
});

describe('Las palabras clave clasifican un soporte', () => {
  /** Como lo arma `leerSoporte`: lo escrito delante, el catálogo detrás. */
  const withTree = (tree: CategoryTree[]) => [...treeSignatures(tree), ...SIGNATURES];

  it('un concepto sin palabras no produce firma', () => {
    expect(treeSignatures(treeWith(concept(1, 'Energía')))).toEqual([]);
  });

  it('reconoce un acreedor que el catálogo no conoce', () => {
    const tree = treeWith(concept(1, 'Arriendo oficina', ['Inmobiliaria del Valle']));

    const reading = classify({
      text: 'INMOBILIARIA DEL VALLE S.A.S.\nCanon de arrendamiento\nTotal a pagar $1.200.000',
      source: 'texto-embebido',
      signatures: withTree(tree),
    });

    expect(reading.concept).toBe('Arriendo oficina');
    expect(reading.value).toBe(1_200_000);
  });

  it('lo encuentra también en el nombre del archivo, que es lo que queda de un escaneo malo', () => {
    const tree = treeWith(concept(1, 'Colegio', ['Comfandi']));

    const reading = classify({
      // El reconocimiento no sacó nada útil del papel.
      text: 'recibo de caja  ****  ',
      source: 'ocr',
      fileName: 'comfandi agosto',
      signatures: withTree(tree),
    });

    expect(reading.concept).toBe('Colegio');
  });

  it('lo escrito por una persona le gana al catálogo', () => {
    // El catálogo reconoce "celsia" como «Celsia (Energia)». Si alguien puso
    // esa misma palabra en SU concepto, manda el suyo.
    const tree = treeWith(concept(1, 'Luz de la casa', ['Celsia']));

    const reading = classify({
      text: 'CELSIA S.A. E.S.P.\nFactura de energía\nTotal a pagar $180.000',
      source: 'texto-embebido',
      signatures: withTree(tree),
    });

    expect(reading.concept).toBe('Luz de la casa');
    // Ganar por prioridad y no por puntos es una duda, pero no puede dejar la
    // confianza por los suelos: el valor se leyó de una línea de total.
    expect(reading.confidence).toBeGreaterThan(0.4);
  });

  it('sin palabras clave, el catálogo sigue mandando', () => {
    const reading = classify({
      text: 'CELSIA S.A. E.S.P.\nFactura de energía\nTotal a pagar $180.000',
      source: 'texto-embebido',
      signatures: withTree(treeWith(concept(1, 'Energía'))),
    });

    expect(reading.concept).toBe('Celsia (Energia)');
  });
});
