import { DICCIONARIO, TUBERIAS, comerciosEn, terminosPara } from './diccionario';

describe('comerciosEn', () => {
  it('finds a merchant as a whole word, ignoring case and accents', () => {
    const hallados = comerciosEn('COMPRA ALMACENES ÉXITO CALLE 80');
    expect(hallados.map((h) => [h.grupo.grupo, h.alias])).toEqual([['mercado', 'almacenes exito']]);
  });

  it('does not match an alias inside another word', () => {
    expect(comerciosEn('parada del bus')).toEqual([]);
  });

  it('reports each group once even when several aliases appear', () => {
    expect(comerciosEn('carulla y exito').map((h) => h.grupo.grupo)).toEqual(['mercado']);
  });

  it('removes payment gateways before looking, so they never name the merchant', () => {
    for (const tuberia of TUBERIAS) {
      expect(comerciosEn(`pago ${tuberia}`)).toEqual([]);
    }
  });
});

describe('terminosPara', () => {
  it('returns the search terms of every group found, without repeats', () => {
    const mercado = DICCIONARIO.find((g) => g.grupo === 'mercado')!;
    expect(terminosPara('compra en carulla y en el exito')).toEqual([...mercado.terminos]);
  });

  it('returns nothing for text with no known merchant', () => {
    expect(terminosPara('transferencia a un amigo')).toEqual([]);
  });
});
