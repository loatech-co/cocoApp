import { DICTIONARY, PIPELINES, merchantsIn, termsFor } from './dictionary';

describe('comerciosEn', () => {
  it('finds a merchant as a whole word, ignoring case and accents', () => {
    const found = merchantsIn('COMPRA ALMACENES ÉXITO CALLE 80');
    expect(found.map((h) => [h.grupo.grupo, h.alias])).toEqual([['mercado', 'almacenes exito']]);
  });

  it('does not match an alias inside another word', () => {
    expect(merchantsIn('parada del bus')).toEqual([]);
  });

  it('reports each group once even when several aliases appear', () => {
    expect(merchantsIn('carulla y exito').map((h) => h.grupo.grupo)).toEqual(['mercado']);
  });

  it('removes payment gateways before looking, so they never name the merchant', () => {
    for (const pipeline of PIPELINES) {
      expect(merchantsIn(`pago ${pipeline}`)).toEqual([]);
    }
  });
});

describe('terminosPara', () => {
  it('returns the search terms of every group found, without repeats', () => {
    const groceries = DICTIONARY.find((g) => g.grupo === 'mercado')!;
    expect(termsFor('compra en carulla y en el exito')).toEqual([...groceries.terminos]);
  });

  it('returns nothing for text with no known merchant', () => {
    expect(termsFor('transferencia a un amigo')).toEqual([]);
  });
});
