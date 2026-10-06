import { treeConceptsWithWords, normalize } from './signatures';

describe('normalize', () => {
  it('drops accents, lowers case and collapses spaces', () => {
    expect(normalize('  Ñandú   ÉXITO\tCalle ')).toBe('nandu exito calle');
  });
});

describe('treeConceptsWithWords', () => {
  it('reads only the concept level and tolerates missing children and keywords', () => {
    expect(
      treeConceptsWithWords([
        { name: 'Vacío' },
        { name: 'Hogar', children: [{ name: 'Sin conceptos' }] },
        {
          name: 'Oficina',
          children: [{ name: 'Papelería', children: [{ name: 'Resmas' }] }],
        },
      ]),
    ).toEqual([{ concept: 'Resmas', category: 'Papelería', costCenter: 'Oficina', words: [] }]);
  });
});
