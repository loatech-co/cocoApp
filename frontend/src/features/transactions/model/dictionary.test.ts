import { describe, expect, it } from 'vitest';

import { DICTIONARY, merchantsIn, termsFor } from '@coco/receipt-parser';

/**
 * The system dictionary: from a merchant to generic terms.
 *
 * What is tested above all are the two matching rules, because they are
 * what separates a help from a nuisance: word boundaries and longest alias
 * first.
 */
const groups = (text: string) => merchantsIn(text).map((h) => h.group.group);

describe('Recognizing merchants in a text', () => {
  it('recognizes the legal name, which is what the card terminal prints', () => {
    expect(groups('KOBA COLOMBIA SAS NIT 900276962')).toEqual(['mercado']);
    expect(groups('JERONIMO MARTINS COLOMBIA')).toEqual(['mercado']);
    expect(groups('ALMACENES EXITO S.A.')).toEqual(['mercado']);
  });

  it('only counts between word boundaries: «ara» is not in «para»', () => {
    expect(groups('Pago para la casa')).toEqual([]);
    expect(groups('compara precios barato')).toEqual([]);
    expect(groups('Compra en ARA calle 5')).toEqual(['mercado']);
  });

  it('and «presto» is not in «préstamo»', () => {
    expect(groups('Desembolso prestamo Bancolombia')).toEqual([]);
    expect(groups('PRESTO AV 6')).toEqual(['restaurantes y domicilios']);
  });

  it('the longest alias wins: «didi food» is delivery, «didi» is transport', () => {
    expect(groups('DIDI FOOD *PEDIDO')).toEqual(['restaurantes y domicilios']);
    expect(groups('DIDI *VIAJE')).toEqual(['transporte']);
  });

  it('what is found is consumed: «claro hogar» does not count again as «claro»', () => {
    const found = merchantsIn('CLARO HOGAR FACTURA');
    expect(found).toHaveLength(1);
    expect(found[0]!.alias).toBe('claro hogar');
  });

  it('the pipes are stripped first: «MERCADO PAGO*D1» is D1, not «mercado»', () => {
    // Without this, any purchase paid through Mercado Pago would be groceries.
    expect(groups('Compra en MERCADO PAGO*D1 por $45.000')).toEqual(['mercado']);
    expect(merchantsIn('Compra en MERCADO PAGO*D1')[0]!.alias).toBe('d1');
    expect(groups('Pago PAYU*NETFLIX')).toEqual(['suscripciones digitales']);
  });

  it('regardless of accents or capitals', () => {
    expect(groups('Supertiendas y Droguerías Olímpica')).toEqual(['mercado']);
    expect(groups('ESTACIÓN DE SERVICIO TERPEL')).toEqual(['combustible']);
  });

  it('several merchants at once return several groups, each one once', () => {
    const g = groups('RAPPI*EXITO entrega');
    expect(g).toHaveLength(2);
    expect(g).toContain('mercado');
    expect(g).toContain('restaurantes y domicilios');
  });

  it('banks are not merchants: a transfer does not classify', () => {
    expect(groups('Transferencia a Bancolombia desde Nequi')).toEqual([]);
    expect(groups('Pago PSE Davivienda')).toEqual([]);
  });
});

describe('The terms a text suggests', () => {
  it('are those of the group found, without repeats', () => {
    const t = termsFor('KOBA COLOMBIA');
    expect(t[0]).toBe('mercado');
    expect(t).toContain('supermercado');
    expect(new Set(t).size).toBe(t.length);
  });

  it('nothing recognized, no term', () => {
    expect(termsFor('Ferretería La Esquina')).toEqual([]);
  });
});

describe('The dictionary itself', () => {
  it('covers the eleven groups the plan asks for', () => {
    expect(DICTIONARY.map((g) => g.group)).toEqual([
      'mercado',
      'restaurantes y domicilios',
      'transporte',
      'combustible',
      'peajes',
      'farmacia',
      'servicios publicos',
      'telecomunicaciones',
      'suscripciones digitales',
      'salud',
      'educacion',
    ]);
  });

  it('no alias is repeated across groups', () => {
    // An alias in two groups is an ambiguity the matching cannot
    // resolve: the first one by file order would always win.
    const seen = new Map<string, string>();
    for (const g of DICTIONARY) {
      for (const alias of g.merchants) {
        expect(
          seen.get(alias),
          `«${alias}» is in ${seen.get(alias)} and in ${g.group}`,
        ).toBeUndefined();
        seen.set(alias, g.group);
      }
    }
  });

  it('no alias is a word so short that it shows up everywhere', () => {
    for (const g of DICTIONARY) {
      for (const alias of g.merchants) expect(alias.length, `«${alias}»`).toBeGreaterThanOrEqual(2);
    }
  });
});
