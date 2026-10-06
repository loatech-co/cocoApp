import { searchInTree, indexTree, resolveTerms, readablePath } from './search';
import { makeTree } from './testing/factories';

describe('indexarArbol', () => {
  it('indexes every level with its path and its ancestors', () => {
    const index = indexTree(makeTree());
    const power = index.find((e) => e.id === 'luz');

    expect(index.map((e) => e.nivel)).toEqual([
      'centro',
      'categoria',
      'concepto',
      'concepto',
      'concepto',
      'categoria',
      'concepto',
      'centro',
    ]);
    expect(power).toMatchObject({ centroId: 'hogar', categoriaId: 'servicios' });
    expect(readablePath(power!)).toBe('Servicios públicos › Hogar');
  });

  it('normalises names and keywords', () => {
    const index = indexTree(makeTree());
    expect(index.find((e) => e.id === 'super')?.palabrasNormalizadas).toEqual(['exito']);
    expect(index.find((e) => e.id === 'oficina')?.palabrasClave).toEqual([]);
  });
});

describe('buscarEnArbol', () => {
  const index = indexTree(makeTree());
  const ids = (query: string, options?: Parameters<typeof searchInTree>[2]) =>
    searchInTree(index, query, options).map((e) => e.id);

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
  const index = indexTree(makeTree());

  it('is certain when the terms point to one concept', () => {
    const r = resolveTerms(index, ['enel', 'energia']);
    expect(r.certeza).toBe('alta');
    expect(r.concepto?.id).toBe('luz');
  });

  it('names the shared category when several concepts of one category match', () => {
    const r = resolveTerms(index, ['agua', 'vanti']);
    expect(r.certeza).toBe('media');
    expect(r.categoria?.id).toBe('servicios');
    expect(r.candidatos.map((c) => c.id)).toEqual(['agua', 'gas']);
  });

  it('names no category when the matching concepts are in different ones', () => {
    const r = resolveTerms(index, ['agua', 'exito']);
    expect(r.certeza).toBe('media');
    expect(r.categoria).toBeUndefined();
  });

  it('falls back to categories when no concept matches', () => {
    expect(resolveTerms(index, ['servicios'])).toMatchObject({
      certeza: 'media',
      categoria: { id: 'servicios' },
    });
    const several = resolveTerms(index, ['servicios', 'mercado']);
    expect(several.certeza).toBe('alta');
  });

  it('is uncertain when nothing matches', () => {
    expect(resolveTerms(index, ['zapatos'])).toEqual({ certeza: 'ninguna', candidatos: [] });
  });
});
