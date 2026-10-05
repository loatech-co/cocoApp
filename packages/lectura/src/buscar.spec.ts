import { buscarEnArbol, indexarArbol, resolverTerminos, rutaLegible } from './buscar';
import { makeTree } from './testing/factories';

describe('indexarArbol', () => {
  it('indexes every level with its path and its ancestors', () => {
    const indice = indexarArbol(makeTree());
    const luz = indice.find((e) => e.id === 'luz');

    expect(indice.map((e) => e.nivel)).toEqual([
      'centro',
      'categoria',
      'concepto',
      'concepto',
      'concepto',
      'categoria',
      'concepto',
      'centro',
    ]);
    expect(luz).toMatchObject({ centroId: 'hogar', categoriaId: 'servicios' });
    expect(rutaLegible(luz!)).toBe('Servicios públicos › Hogar');
  });

  it('normalises names and keywords', () => {
    const indice = indexarArbol(makeTree());
    expect(indice.find((e) => e.id === 'super')?.palabrasNormalizadas).toEqual(['exito']);
    expect(indice.find((e) => e.id === 'oficina')?.palabrasClave).toEqual([]);
  });
});

describe('buscarEnArbol', () => {
  const indice = indexarArbol(makeTree());
  const ids = (consulta: string, opciones?: Parameters<typeof buscarEnArbol>[2]) =>
    buscarEnArbol(indice, consulta, opciones).map((e) => e.id);

  it('returns nothing for an empty query', () => {
    expect(ids('   ')).toEqual([]);
  });

  it('ranks exact name, then prefix, then substring, then keyword', () => {
    expect(ids('energia')).toEqual(['luz']);
    expect(ids('gas')).toEqual(['gas']);
    expect(ids('mercado')).toEqual(['mercado', 'super']);
    expect(ids('enel')).toEqual(['luz']);
  });

  it('requires every word of the query to match', () => {
    expect(ids('gas natural')).toEqual(['gas']);
    expect(ids('gas luz')).toEqual([]);
  });

  it('breaks ties by level and then alphabetically', () => {
    expect(ids('a')).toEqual(['agua', 'luz', 'gas', 'super', 'mercado']);
  });

  it('searches only the levels asked for, up to the limit', () => {
    expect(ids('hogar')).toEqual([]);
    expect(ids('hogar', { niveles: ['centro'] })).toEqual(['hogar']);
    expect(ids('a', { limite: 2 })).toEqual(['agua', 'luz']);
  });
});

describe('resolverTerminos', () => {
  const indice = indexarArbol(makeTree());

  it('is certain when the terms point to one concept', () => {
    const r = resolverTerminos(indice, ['enel', 'energia']);
    expect(r.certeza).toBe('alta');
    expect(r.concepto?.id).toBe('luz');
  });

  it('names the shared category when several concepts of one category match', () => {
    const r = resolverTerminos(indice, ['agua', 'vanti']);
    expect(r.certeza).toBe('media');
    expect(r.categoria?.id).toBe('servicios');
    expect(r.candidatos.map((c) => c.id)).toEqual(['agua', 'gas']);
  });

  it('names no category when the matching concepts are in different ones', () => {
    const r = resolverTerminos(indice, ['agua', 'exito']);
    expect(r.certeza).toBe('media');
    expect(r.categoria).toBeUndefined();
  });

  it('falls back to categories when no concept matches', () => {
    expect(resolverTerminos(indice, ['servicios'])).toMatchObject({
      certeza: 'media',
      categoria: { id: 'servicios' },
    });
    const varias = resolverTerminos(indice, ['servicios', 'mercado']);
    expect(varias.certeza).toBe('alta');
  });

  it('is uncertain when nothing matches', () => {
    expect(resolverTerminos(indice, ['zapatos'])).toEqual({ certeza: 'ninguna', candidatos: [] });
  });
});
