import type { SearchableNode } from '../search';
import type { ConceptWithWords } from '../signatures';

/**
 * Test data factories for this package. Each one returns a valid object with
 * neutral defaults; a test overrides only what it is about.
 */

let nextId = 1;

function makeNode(overrides: Partial<SearchableNode> & { name: string }): SearchableNode {
  nextId += 1;
  return { id: nextId, ...overrides };
}

/** Center › category › concept, the three levels every tree has. */
export function makeTree(): SearchableNode[] {
  return [
    makeNode({
      id: 'hogar',
      name: 'Hogar',
      children: [
        makeNode({
          id: 'servicios',
          name: 'Servicios públicos',
          children: [
            makeNode({ id: 'luz', name: 'Energía', palabras_clave: ['luz', 'enel'] }),
            makeNode({ id: 'agua', name: 'Acueducto', palabras_clave: ['agua'] }),
            makeNode({ id: 'gas', name: 'Gas natural', palabras_clave: ['vanti'] }),
          ],
        }),
        makeNode({
          id: 'mercado',
          name: 'Mercado',
          children: [makeNode({ id: 'super', name: 'Supermercado', palabras_clave: ['éxito'] })],
        }),
      ],
    }),
    makeNode({ id: 'oficina', name: 'Oficina' }),
  ];
}

export function makeConceptWithWords(overrides: Partial<ConceptWithWords> = {}): ConceptWithWords {
  return {
    concepto: 'Energía',
    categoria: 'Servicios públicos',
    centro: 'Hogar',
    palabras: ['enel'],
    ...overrides,
  };
}
