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
            makeNode({ id: 'luz', name: 'Energía', keywords: ['luz', 'enel'] }),
            makeNode({ id: 'agua', name: 'Acueducto', keywords: ['agua'] }),
            makeNode({ id: 'gas', name: 'Gas natural', keywords: ['vanti'] }),
          ],
        }),
        makeNode({
          id: 'mercado',
          name: 'Mercado',
          children: [makeNode({ id: 'super', name: 'Supermercado', keywords: ['éxito'] })],
        }),
      ],
    }),
    makeNode({ id: 'oficina', name: 'Oficina' }),
  ];
}

export function makeConceptWithWords(overrides: Partial<ConceptWithWords> = {}): ConceptWithWords {
  return {
    concept: 'Energía',
    category: 'Servicios públicos',
    costCenter: 'Hogar',
    words: ['enel'],
    ...overrides,
  };
}
