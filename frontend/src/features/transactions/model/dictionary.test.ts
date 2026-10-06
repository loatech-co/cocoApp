import { describe, expect, it } from 'vitest';

import { DICTIONARY, merchantsIn, termsFor } from '@coco/receipt-parser';

/**
 * El diccionario del sistema: de un comercio a términos genéricos.
 *
 * Lo que se prueba sobre todo son las dos reglas del emparejado, porque son
 * las que separan una ayuda de una molestia: límites de palabra y alias más
 * largo primero.
 */
const grupos = (texto: string) => merchantsIn(texto).map((h) => h.group.group);

describe('Reconocer comercios en un texto', () => {
  it('reconoce la razón social, que es lo que imprime el datáfono', () => {
    expect(grupos('KOBA COLOMBIA SAS NIT 900276962')).toEqual(['mercado']);
    expect(grupos('JERONIMO MARTINS COLOMBIA')).toEqual(['mercado']);
    expect(grupos('ALMACENES EXITO S.A.')).toEqual(['mercado']);
  });

  it('solo cuenta entre límites de palabra: «ara» no está en «para»', () => {
    expect(grupos('Pago para la casa')).toEqual([]);
    expect(grupos('compara precios barato')).toEqual([]);
    expect(grupos('Compra en ARA calle 5')).toEqual(['mercado']);
  });

  it('y «presto» no está en «préstamo»', () => {
    expect(grupos('Desembolso prestamo Bancolombia')).toEqual([]);
    expect(grupos('PRESTO AV 6')).toEqual(['restaurantes y domicilios']);
  });

  it('gana el alias más largo: «didi food» es domicilios, «didi» es transporte', () => {
    expect(grupos('DIDI FOOD *PEDIDO')).toEqual(['restaurantes y domicilios']);
    expect(grupos('DIDI *VIAJE')).toEqual(['transporte']);
  });

  it('lo hallado se consume: «claro hogar» no vuelve a contar como «claro»', () => {
    const hallados = merchantsIn('CLARO HOGAR FACTURA');
    expect(hallados).toHaveLength(1);
    expect(hallados[0]!.alias).toBe('claro hogar');
  });

  it('las tuberías se quitan antes: «MERCADO PAGO*D1» es D1, no «mercado»', () => {
    // Sin esto, cualquier compra pagada por Mercado Pago sería mercado.
    expect(grupos('Compra en MERCADO PAGO*D1 por $45.000')).toEqual(['mercado']);
    expect(merchantsIn('Compra en MERCADO PAGO*D1')[0]!.alias).toBe('d1');
    expect(grupos('Pago PAYU*NETFLIX')).toEqual(['suscripciones digitales']);
  });

  it('sin tildes ni mayúsculas', () => {
    expect(grupos('Supertiendas y Droguerías Olímpica')).toEqual(['mercado']);
    expect(grupos('ESTACIÓN DE SERVICIO TERPEL')).toEqual(['combustible']);
  });

  it('varios comercios a la vez devuelven varios grupos, cada uno una vez', () => {
    const g = grupos('RAPPI*EXITO entrega');
    expect(g).toHaveLength(2);
    expect(g).toContain('mercado');
    expect(g).toContain('restaurantes y domicilios');
  });

  it('los bancos no son comercios: una transferencia no clasifica', () => {
    expect(grupos('Transferencia a Bancolombia desde Nequi')).toEqual([]);
    expect(grupos('Pago PSE Davivienda')).toEqual([]);
  });
});

describe('Los términos que un texto sugiere', () => {
  it('son los del grupo hallado, sin repetir', () => {
    const t = termsFor('KOBA COLOMBIA');
    expect(t[0]).toBe('mercado');
    expect(t).toContain('supermercado');
    expect(new Set(t).size).toBe(t.length);
  });

  it('nada reconocido, ningún término', () => {
    expect(termsFor('Ferretería La Esquina')).toEqual([]);
  });
});

describe('El diccionario en sí', () => {
  it('cubre los once grupos que pide el plan', () => {
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

  it('ningún alias está repetido entre grupos', () => {
    // Un alias en dos grupos es una ambigüedad que el emparejado no puede
    // resolver: siempre ganaría el primero por orden del archivo.
    const vistos = new Map<string, string>();
    for (const g of DICTIONARY) {
      for (const alias of g.merchants) {
        expect(
          vistos.get(alias),
          `«${alias}» está en ${vistos.get(alias)} y en ${g.group}`,
        ).toBeUndefined();
        vistos.set(alias, g.group);
      }
    }
  });

  it('ningún alias es una palabra tan corta que aparezca por todas partes', () => {
    for (const g of DICTIONARY) {
      for (const alias of g.merchants) expect(alias.length, `«${alias}»`).toBeGreaterThanOrEqual(2);
    }
  });
});
