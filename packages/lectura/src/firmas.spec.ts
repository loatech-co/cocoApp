import { conceptosConPalabrasDelArbol, normalizar } from './firmas';

describe('normalizar', () => {
  it('drops accents, lowers case and collapses spaces', () => {
    expect(normalizar('  Ñandú   ÉXITO\tCalle ')).toBe('nandu exito calle');
  });
});

describe('conceptosConPalabrasDelArbol', () => {
  it('reads only the concept level and tolerates missing children and keywords', () => {
    expect(
      conceptosConPalabrasDelArbol([
        { name: 'Vacío' },
        { name: 'Hogar', children: [{ name: 'Sin conceptos' }] },
        {
          name: 'Oficina',
          children: [{ name: 'Papelería', children: [{ name: 'Resmas' }] }],
        },
      ]),
    ).toEqual([{ concepto: 'Resmas', categoria: 'Papelería', centro: 'Oficina', palabras: [] }]);
  });
});
