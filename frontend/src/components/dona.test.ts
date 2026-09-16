import { describe, expect, it } from 'vitest';

import { arcosDeLaDona, VUELTA } from './dona';

/**
 * La geometría de la dona, con números.
 *
 * Lo que se comprueba no se ve a ojo: que el período del patrón de guiones
 * siga siendo la vuelta entera, que las porciones no se pisen más de lo
 * previsto, que una de cero no dibuje una marquita. Un error en cualquiera de
 * las tres se ve en pantalla como «algo raro pasa con la dona» y no dice qué.
 */
const porcion = (nombre: string, valor: number) => ({ id: null, nombre, valor });

describe('Los arcos de la dona', () => {
  it('reparten la vuelta en proporción al valor', () => {
    const arcos = arcosDeLaDona([porcion('a', 75), porcion('b', 25)], 100);

    expect(arcos.map((a) => a.porcentaje)).toEqual([75, 25]);
    expect(arcos[0].fraccion).toBeCloseTo(0.75);
    expect(arcos[1].fraccion).toBeCloseTo(0.25);
  });

  it('ordena de mayor a menor, venga como venga', () => {
    // El orden lo decide el tamaño y no el que trae la API: una dona cuyas
    // porciones no van de mayor a menor se lee como si no hubiera orden.
    const arcos = arcosDeLaDona([porcion('chica', 10), porcion('grande', 90)], 100);
    expect(arcos.map((a) => a.nombre)).toEqual(['grande', 'chica']);
  });

  it('el total manda sobre la suma: lo que falta queda como hueco', () => {
    // Dos porciones de 30 con un total de 100 no cierran el aro. Cerrarlo
    // diría que todo el gasto está en esas dos categorías, y no lo está.
    const arcos = arcosDeLaDona([porcion('a', 30), porcion('b', 30)], 100);

    const nominal = arcos.reduce((suma, a) => suma + a.fraccion, 0);
    expect(nominal).toBeCloseTo(0.6);
    expect(arcos.every((a) => a.largo < VUELTA)).toBe(true);
  });

  it('cada arco arranca antes de su sitio, para taparle la costura al vecino', () => {
    /*
      El invariante del solape: el arco empieza `solape` antes de donde le
      toca —de ahí el `desfase` positivo— y mide `solape` más de lo que le
      toca. Así se mete por debajo del anterior y el suavizado no deja pasar el
      aro de fondo entre los dos.

      Se comprueba la DIFERENCIA con el nominal, no el 0.75 literal: si algún
      día hace falta más o menos solape, lo que tiene que seguir siendo cierto
      es que el arco se pase por los dos extremos en la misma medida.
    */
    const arcos = arcosDeLaDona([porcion('a', 50), porcion('b', 50)], 100);

    for (const [i, arco] of arcos.entries()) {
      const nominalLargo = arco.fraccion * VUELTA;
      const nominalDesde = i * 0.5 * VUELTA;

      const solape = arco.largo - nominalLargo;
      expect(solape).toBeGreaterThan(0);
      // El mismo por delante que por detrás.
      expect(arco.desfase + nominalDesde).toBeCloseTo(solape);
    }
  });

  it('una sola porción no se solapa consigo misma', () => {
    // Con un arco no hay costura que tapar, y el solape la haría dar más de
    // una vuelta: un `strokeDasharray` con el hueco en negativo es inválido.
    const [arco] = arcosDeLaDona([porcion('todo', 100)], 100);

    expect(arco.largo).toBeCloseTo(VUELTA);
    expect(arco.desfase).toBe(0);
  });

  it('una porción sin valor no dibuja nada', () => {
    // Con solape, un arco de cero mediría 0.75 y se vería como una marquita de
    // algo que no está.
    const arcos = arcosDeLaDona([porcion('a', 100), porcion('vacía', 0)], 100);
    const vacia = arcos.find((a) => a.nombre === 'vacía');

    expect(vacia?.largo).toBe(0);
  });

  it('ningún arco pasa de una vuelta', () => {
    // El caso del redondeo: porciones que suman justo el total, más el solape.
    const arcos = arcosDeLaDona([porcion('a', 99.9), porcion('b', 0.1)], 100);
    expect(arcos.every((a) => a.largo <= VUELTA)).toBe(true);
  });

  it('sin total, se reparte la suma de las porciones', () => {
    // Pasa cuando el recorte no trae total: el aro cierra con lo que hay, que
    // es mejor que un anillo vacío.
    const arcos = arcosDeLaDona([porcion('a', 3), porcion('b', 1)], 0);

    expect(arcos.map((a) => a.porcentaje)).toEqual([75, 25]);
  });

  it('sin porciones no revienta', () => {
    expect(arcosDeLaDona([], 0)).toEqual([]);
  });
});
