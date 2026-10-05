import { describe, expect, it } from 'vitest';

import { arcosDeLaDona, sectorDeLaDona } from './dona';

/**
 * La geometría de la dona, con números.
 *
 * Lo que se comprueba no se ve a ojo: que todas las capas terminen en el mismo
 * sitio, que el hueco de lo que falta por clasificar no se lo coma nadie, que
 * una porción de cero no dibuje una marquita. Un error en cualquiera de las
 * tres se ve en pantalla como «algo raro pasa con la dona» y no dice qué.
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
    const arcos = arcosDeLaDona([porcion('chica', 10), porcion('grande', 90)], 100);

    expect(arcos.map((a) => a.nombre)).toEqual(['grande', 'chica']);
  });

  it('cada porción arranca donde termina la anterior', () => {
    // Es lo que hace que el corte que se VE —el canto de arranque de la de
    // encima— caiga donde dicen los datos y no medio grado más allá.
    const arcos = arcosDeLaDona([porcion('a', 50), porcion('b', 30), porcion('c', 20)], 100);

    expect(arcos[0].desde).toBeCloseTo(0);
    expect(arcos[1].desde).toBeCloseTo(0.5);
    expect(arcos[2].desde).toBeCloseTo(0.8);
  });

  it('todas las capas terminan donde terminan los datos', () => {
    /*
      El invariante de las capas, que es lo que hace que el corte sea recto.

      Cada porción se pinta desde su sitio hasta donde terminan TODOS los
      datos, no hasta donde termina ella, y la siguiente la tapa. Así ningún
      corte es un canto contra el fondo —donde el suavizado deja pasar un pelo
      oscuro— sino el canto de arranque de la de encima sobre color opaco.
    */
    const arcos = arcosDeLaDona([porcion('a', 50), porcion('b', 30), porcion('c', 20)], 100);

    for (const arco of arcos) expect(arco.hasta).toBeCloseTo(1);
  });

  it('el total manda sobre la suma: lo que falta queda como hueco', () => {
    // Dos porciones de 30 con un total de 100 no cierran el aro. Cerrarlo
    // diría que todo el gasto está en esas dos categorías, y no lo está.
    const arcos = arcosDeLaDona([porcion('a', 30), porcion('b', 30)], 100);

    // Las capas se paran en el 60 %: el 40 % restante es el hueco.
    for (const arco of arcos) expect(arco.hasta).toBeCloseTo(0.6);
  });

  it('una porción sin valor no dibuja nada', () => {
    // Las de cero quedan al final del orden, así que arrancan justo donde
    // acaban los datos y su capa mide cero. Una marquita de algo que no está
    // es peor que no dibujar nada.
    const arcos = arcosDeLaDona([porcion('a', 100), porcion('vacía', 0)], 100);
    const vacia = arcos.find((a) => a.nombre === 'vacía');

    expect(vacia?.hasta).toBeCloseTo(vacia?.desde ?? -1);
    expect(sectorDeLaDona(vacia?.desde ?? 0, vacia?.hasta ?? 0)).toBe('');
  });

  it('ninguna capa se pasa de una vuelta', () => {
    // El caso del redondeo: porciones que suman algo más que el total.
    const arcos = arcosDeLaDona([porcion('a', 99.9), porcion('b', 0.2)], 100);

    for (const arco of arcos) expect(arco.hasta).toBeLessThanOrEqual(1);
  });

  it('sin total, se reparte la suma de las porciones', () => {
    // Pasa cuando el recorte no trae total: el aro cierra con lo que hay, que
    // es mejor que un anillo vacío.
    const arcos = arcosDeLaDona([porcion('a', 3), porcion('b', 1)], 0);

    expect(arcos.map((a) => a.porcentaje)).toEqual([75, 25]);
    expect(arcos[0].hasta).toBeCloseTo(1);
  });

  it('sin porciones no revienta', () => {
    expect(arcosDeLaDona([], 0)).toEqual([]);
  });
});

/**
 * El sector: dos arcos y DOS CORTES RADIALES.
 *
 * Es lo que se reescribió, y por eso se prueba. Antes el aro se dibujaba con
 * un trazo y `stroke-dasharray`, y ahí el corte de cada guion lo pone el
 * navegador perpendicular a la tangente de una curva APROXIMADA: sobre un
 * trazo que mide 26 de ancho, medio grado de error en esa tangente mueve el
 * canto de fuera respecto al de dentro y el corte se ve torcido.
 *
 * Un sector no depende de ninguna tangente: sus cortes son el segmento entre
 * el canto de dentro y el de fuera EN EL MISMO ÁNGULO.
 */
describe('El sector de la dona', () => {
  /** Los puntos de una `d`, en pares. */
  const puntos = (d: string): [number, number][] => {
    const n = d.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
    // `M x y`, `A r r 0 f f x y`, `L x y`, `A r r 0 f f x y`
    return [
      [n[0], n[1]],
      [n[7], n[8]],
      [n[9], n[10]],
      [n[16], n[17]],
    ];
  };

  it('empieza a las doce y avanza en el sentido del reloj', () => {
    const [arranqueFuera, finFuera] = puntos(sectorDeLaDona(0, 0.25));
    // El lienzo mide (68 + 13) * 2 + 4 = 166, así que el centro cae en 83.
    const CENTRO = 83;

    // Arranca arriba: misma x que el centro, y por encima.
    expect(arranqueFuera[0]).toBeCloseTo(CENTRO);
    expect(arranqueFuera[1]).toBeLessThan(CENTRO);

    // Un cuarto de vuelta después está a la derecha, a la altura del centro.
    expect(finFuera[0]).toBeGreaterThan(CENTRO);
    expect(finFuera[1]).toBeCloseTo(CENTRO);
  });

  it('los dos cortes son radiales: sus extremos comparten ángulo', () => {
    // Lo que hace que el corte sea recto por construcción. Si el canto de
    // fuera y el de dentro no cayeran en el mismo ángulo, el corte saldría
    // torcido: es exactamente el defecto que tenía el dibujo con guiones.
    // El lienzo mide (68 + 13) * 2 + 4 = 166, así que el centro cae en 83.
    const CENTRO = 83;
    const angulo = ([x, y]: [number, number]): number => Math.atan2(y - CENTRO, x - CENTRO);

    for (const [desde, hasta] of [
      [0, 0.25],
      [0.13, 0.9],
      [0.5, 0.75],
    ]) {
      const [a, b, c, d] = puntos(sectorDeLaDona(desde, hasta));

      // `a` y `d` son el corte de arranque; `b` y `c` el del final.
      //
      // Cuatro decimales y no más porque la `d` se escribe con tres: sobre un
      // radio de 55, una milésima de unidad son unas dos cienmilésimas de
      // radián, que es una milésima de grado. Pedir más sería medir el
      // redondeo del texto, no la geometría.
      expect(angulo(a)).toBeCloseTo(angulo(d), 4);
      expect(angulo(b)).toBeCloseTo(angulo(c), 4);
    }
  });

  it('pasada la media vuelta pide el arco largo', () => {
    // Sin esa bandera el navegador elige el arco corto y la porción sale al
    // revés: una de 300° se dibujaría como una de 60°.
    expect(sectorDeLaDona(0, 0.9)).toMatch(/A 81 81 0 1 1/);
    expect(sectorDeLaDona(0, 0.3)).toMatch(/A 81 81 0 0 1/);
  });

  it('una porción de cero no dibuja nada', () => {
    expect(sectorDeLaDona(0.4, 0.4)).toBe('');
    expect(sectorDeLaDona(0.4, 0.2)).toBe('');
  });
});
