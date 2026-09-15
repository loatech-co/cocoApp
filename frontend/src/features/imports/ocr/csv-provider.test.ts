import { describe, expect, it } from 'vitest';

import { CsvTextProvider, decodificar } from './csv-provider';

/** Bytes de un texto en Windows-1252, que es lo que exporta Excel en español. */
function enLatin1(texto: string): Uint8Array {
  const mapa: Record<string, number> = {
    á: 0xe1, é: 0xe9, í: 0xed, ó: 0xf3, ú: 0xfa,
    Á: 0xc1, É: 0xc9, Í: 0xcd, Ó: 0xd3, Ú: 0xda,
    ñ: 0xf1, Ñ: 0xd1, ü: 0xfc,
  };
  return new Uint8Array([...texto].map((c) => mapa[c] ?? c.charCodeAt(0)));
}

describe('Lectura del archivo CSV', () => {
  describe('decodificar', () => {
    it('lee UTF-8 normal', () => {
      const bytes = new TextEncoder().encode('Éxito Poblado, Peñalisa');
      expect(decodificar(bytes)).toBe('Éxito Poblado, Peñalisa');
    });

    it('quita la marca de orden de bytes si viene', () => {
      const contenido = new TextEncoder().encode('Fecha;Valor');
      const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...contenido]);
      // Sin quitarla, la primera cabecera sería "﻿Fecha" y no coincidiría
      // con ningún sinónimo: el archivo entero parecería no tener fecha.
      expect(decodificar(conBom)).toBe('Fecha;Valor');
    });

    // ── El caso que corrompe años de historial ──
    it('detecta Windows-1252 y lee bien las tildes', () => {
      // Excel en español guarda así. Leerlo como UTF-8 dejaría "�xito".
      expect(decodificar(enLatin1('Éxito Poblado'))).toBe('Éxito Poblado');
      expect(decodificar(enLatin1('Peñalisa'))).toBe('Peñalisa');
    });

    it('no confunde un UTF-8 válido con Latin-1', () => {
      // La detección es estricta: solo cae a Windows-1252 si UTF-8 FALLA.
      const bytes = new TextEncoder().encode('Café — Medellín');
      expect(decodificar(bytes)).toBe('Café — Medellín');
    });

    it('sobrevive a un archivo vacío', () => {
      expect(decodificar(new Uint8Array([]))).toBe('');
    });
  });

  describe('puedeCon', () => {
    const proveedor = new CsvTextProvider();
    const archivo = (name: string, type = '') => ({ name, type }) as File;

    it.each([
      ['movimientos.csv', ''],
      ['movimientos.CSV', ''],
      ['datos.tsv', ''],
      ['export.txt', ''],
    ])('acepta %p aunque el tipo MIME venga vacío', (nombre, tipo) => {
      // El MIME de un .csv es un desastre entre sistemas: Windows lo marca
      // como application/vnd.ms-excel y algunos navegadores lo dejan vacío.
      expect(proveedor.puedeCon(archivo(nombre, tipo))).toBe(true);
    });

    it.each(['text/csv', 'application/vnd.ms-excel'])('acepta el tipo MIME %p', (tipo) => {
      expect(proveedor.puedeCon(archivo('sin-extension', tipo))).toBe(true);
    });

    it('rechaza lo que no es un CSV', () => {
      expect(proveedor.puedeCon(archivo('extracto.pdf', 'application/pdf'))).toBe(false);
      expect(proveedor.puedeCon(archivo('captura.png', 'image/png'))).toBe(false);
    });
  });

  it('declara que el documento no sale del equipo', () => {
    expect(new CsvTextProvider().enviaElDocumentoFuera).toBe(false);
  });
});
