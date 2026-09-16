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

  it('cada porción llega hasta el final de los datos, y la siguiente la tapa', () => {
    /*
      El invariante de las capas, que es lo que hace que el corte sea recto.

      Cada porción se pinta desde su sitio hasta donde terminan TODOS los
      datos, no hasta donde termina ella. Así cada corte es un solo canto
      —el de la de encima— apoyado sobre un color opaco y no sobre el fondo,
      y el suavizado no tiene por dónde dejar pasar el aro de debajo.

      Antes cada arco se metía 0.75 unidades por debajo del anterior, y eso
      tenía dos fallos: el de la primera daba la vuelta al patrón y se comía
      parte del hueco, y en cuanto una porción bajaba de opacidad el solape
      asomaba pegado al corte.
    */
    const arcos = arcosDeLaDona([porcion('a', 50), porcion('b', 50)], 100);

    // La primera cubre el aro entero; la segunda, su mitad.
    expect(arcos[0].largo).toBeCloseTo(VUELTA);
    expect(arcos[1].largo).toBeCloseTo(VUELTA / 2);

    // Y cada una arranca EXACTAMENTE en su sitio: sin eso, el corte que se ve
    // —que es el canto de la de encima— no caería donde dicen los datos.
    expect(arcos[0].desfase).toBeCloseTo(0);
    expect(arcos[1].desfase).toBeCloseTo(-VUELTA / 2);
  });

  it('con hueco, las capas terminan donde terminan los datos', () => {
    // Lo que falta por clasificar tiene que seguir viéndose. Si las capas
    // llegaran al final del ARO en vez de al final de los datos, la primera
    // taparía el hueco y el aro diría que está todo clasificado.
    const arcos = arcosDeLaDona([porcion('a', 74), porcion('b', 25)], 100);

    expect(arcos[0].largo).toBeCloseTo(0.99 * VUELTA);
    expect(arcos[1].largo).toBeCloseTo(0.25 * VUELTA);
  });

  it('una sola porción da la vuelta entera', () => {
    // No hay costura que tapar y tampoco nada que la tape a ella: es la única
    // capa. Pasarse de una vuelta dejaría el hueco del patrón en negativo, que
    // es un `strokeDasharray` inválido.
    const [arco] = arcosDeLaDona([porcion('todo', 100)], 100);

    expect(arco.largo).toBeCloseTo(VUELTA);
    expect(arco.desfase).toBeCloseTo(0);
  });

  it('una porción sin valor no dibuja nada', () => {
    // Las de cero quedan al final del orden, así que arrancan justo donde
    // acaban los datos y su capa mide cero. Una marquita de algo que no está
    // es peor que no dibujar nada.
    const arcos = arcosDeLaDona([porcion('a', 100), porcion('vacía', 0)], 100);
    const vacia = arcos.find((a) => a.nombre === 'vacía');

    expect(vacia?.largo).toBe(0);
  });

  it('ningún arco pasa de una vuelta', () => {
    // El caso del redondeo: porciones que suman algo más que el total.
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
