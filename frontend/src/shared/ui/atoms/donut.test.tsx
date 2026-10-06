// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { donutArcs, Donut, donutSector } from './donut';

afterEach(cleanup);

/**
 * La geometría de la dona, con números.
 *
 * Lo que se comprueba no se ve a ojo: que todas las capas terminen en el mismo
 * sitio, que el hueco de lo que falta por clasificar no se lo coma nadie, que
 * una porción de cero no dibuje una marquita. Un error en cualquiera de las
 * tres se ve en pantalla como «algo raro pasa con la dona» y no dice qué.
 */
const portion = (name: string, value: number) => ({ id: null, name, value });

describe('Los arcos de la dona', () => {
  it('reparten la vuelta en proporción al valor', () => {
    const arcs = donutArcs([portion('a', 75), portion('b', 25)], 100);

    expect(arcs.map((a) => a.percentage)).toEqual([75, 25]);
    expect(arcs[0]!.fraction).toBeCloseTo(0.75);
    expect(arcs[1]!.fraction).toBeCloseTo(0.25);
  });

  it('ordena de mayor a menor, venga como venga', () => {
    const arcs = donutArcs([portion('chica', 10), portion('grande', 90)], 100);

    expect(arcs.map((a) => a.name)).toEqual(['grande', 'chica']);
  });

  it('cada porción arranca donde termina la anterior', () => {
    // Es lo que hace que el corte que se VE —el canto de arranque de la de
    // encima— caiga donde dicen los datos y no medio grado más allá.
    const arcs = donutArcs([portion('a', 50), portion('b', 30), portion('c', 20)], 100);

    expect(arcs[0]!.from).toBeCloseTo(0);
    expect(arcs[1]!.from).toBeCloseTo(0.5);
    expect(arcs[2]!.from).toBeCloseTo(0.8);
  });

  it('todas las capas terminan donde terminan los datos', () => {
    /*
      El invariante de las capas, que es lo que hace que el corte sea recto.

      Cada porción se pinta desde su sitio hasta donde terminan TODOS los
      datos, no hasta donde termina ella, y la siguiente la tapa. Así ningún
      corte es un canto contra el fondo —donde el suavizado deja pasar un pelo
      oscuro— sino el canto de arranque de la de encima sobre color opaco.
    */
    const arcs = donutArcs([portion('a', 50), portion('b', 30), portion('c', 20)], 100);

    for (const arc of arcs) expect(arc.to).toBeCloseTo(1);
  });

  it('el total manda sobre la suma: lo que falta queda como hueco', () => {
    // Dos porciones de 30 con un total de 100 no cierran el aro. Cerrarlo
    // diría que todo el gasto está en esas dos categorías, y no lo está.
    const arcs = donutArcs([portion('a', 30), portion('b', 30)], 100);

    // Las capas se paran en el 60 %: el 40 % restante es el hueco.
    for (const arc of arcs) expect(arc.to).toBeCloseTo(0.6);
  });

  it('una porción sin valor no dibuja nada', () => {
    // Las de cero quedan al final del orden, así que arrancan justo donde
    // acaban los datos y su capa mide cero. Una marquita de algo que no está
    // es peor que no dibujar nada.
    const arcs = donutArcs([portion('a', 100), portion('vacía', 0)], 100);
    const empty = arcs.find((a) => a.name === 'vacía');

    expect(empty?.to).toBeCloseTo(empty?.from ?? -1);
    expect(donutSector(empty?.from ?? 0, empty?.to ?? 0)).toBe('');
  });

  it('ninguna capa se pasa de una vuelta', () => {
    // El caso del redondeo: porciones que suman algo más que el total.
    const arcs = donutArcs([portion('a', 99.9), portion('b', 0.2)], 100);

    for (const arc of arcs) expect(arc.to).toBeLessThanOrEqual(1);
  });

  it('sin total, se reparte la suma de las porciones', () => {
    // Pasa cuando el recorte no trae total: el aro cierra con lo que hay, que
    // es mejor que un anillo vacío.
    const arcs = donutArcs([portion('a', 3), portion('b', 1)], 0);

    expect(arcs.map((a) => a.percentage)).toEqual([75, 25]);
    expect(arcs[0]!.to).toBeCloseTo(1);
  });

  it('sin porciones no revienta', () => {
    expect(donutArcs([], 0)).toEqual([]);
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
  const points = (d: string): [number, number][] => {
    const n = d.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
    // `M x y`, `A r r 0 f f x y`, `L x y`, `A r r 0 f f x y`
    return [
      [n[0]!, n[1]!],
      [n[7]!, n[8]!],
      [n[9]!, n[10]!],
      [n[16]!, n[17]!],
    ];
  };

  it('empieza a las doce y avanza en el sentido del reloj', () => {
    const [startOutside, endOutside] = points(donutSector(0, 0.25));
    // El lienzo mide (68 + 13) * 2 + 4 = 166, así que el centro cae en 83.
    const CENTER = 83;

    // Arranca arriba: misma x que el centro, y por encima.
    expect(startOutside![0]).toBeCloseTo(CENTER);
    expect(startOutside![1]).toBeLessThan(CENTER);

    // Un cuarto de vuelta después está a la derecha, a la altura del centro.
    expect(endOutside![0]).toBeGreaterThan(CENTER);
    expect(endOutside![1]).toBeCloseTo(CENTER);
  });

  it('los dos cortes son radiales: sus extremos comparten ángulo', () => {
    // Lo que hace que el corte sea recto por construcción. Si el canto de
    // fuera y el de dentro no cayeran en el mismo ángulo, el corte saldría
    // torcido: es exactamente el defecto que tenía el dibujo con guiones.
    // El lienzo mide (68 + 13) * 2 + 4 = 166, así que el centro cae en 83.
    const CENTER = 83;
    const angle = ([x, y]: [number, number]): number => Math.atan2(y - CENTER, x - CENTER);

    for (const [from, to] of [
      [0, 0.25],
      [0.13, 0.9],
      [0.5, 0.75],
    ]) {
      const [a, b, c, d] = points(donutSector(from!, to!));

      // `a` y `d` son el corte de arranque; `b` y `c` el del final.
      //
      // Cuatro decimales y no más porque la `d` se escribe con tres: sobre un
      // radio de 55, una milésima de unidad son unas dos cienmilésimas de
      // radián, que es una milésima de grado. Pedir más sería medir el
      // redondeo del texto, no la geometría.
      expect(angle(a!)).toBeCloseTo(angle(d!), 4);
      expect(angle(b!)).toBeCloseTo(angle(c!), 4);
    }
  });

  it('pasada la media vuelta pide el arco largo', () => {
    // Sin esa bandera el navegador elige el arco corto y la porción sale al
    // revés: una de 300° se dibujaría como una de 60°.
    expect(donutSector(0, 0.9)).toMatch(/A 81 81 0 1 1/);
    expect(donutSector(0, 0.3)).toMatch(/A 81 81 0 0 1/);
  });

  it('una porción de cero no dibuja nada', () => {
    expect(donutSector(0.4, 0.4)).toBe('');
    expect(donutSector(0.4, 0.2)).toBe('');
  });
});

describe('Dona', () => {
  // Neutral sample values: the tests look at names, order and shares.
  /** What the ring draws for each slice, in list order; the background ring is left out. */
  const shapes = (container: HTMLElement): Element[] =>
    Array.from(container.querySelectorAll('svg > *')).slice(1);

  const SLICES = [
    { id: 1, name: 'Vivienda', value: 3 },
    { id: 2, name: 'Aseo', value: 1 },
    { id: null, name: 'Sin clasificar', value: 0 },
  ];

  it('is an image with a name, and lists its slices largest first', () => {
    render(<Donut portions={SLICES} total={4} />);

    expect(screen.getByRole('img', { name: 'Distribución del gasto' })).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Vivienda',
      'Aseo',
      'Sin clasificar',
    ]);
  });

  it('draws nothing for an empty slice', () => {
    const { container } = render(<Donut portions={SLICES} total={4} />);

    expect(shapes(container)).toHaveLength(2);
  });

  it('draws a full ring when one slice is the whole total', () => {
    const { container } = render(
      <Donut portions={[{ id: 1, name: 'Vivienda', value: 1 }]} total={1} />,
    );

    // The background ring plus the slice.
    expect(container.querySelectorAll('svg circle')).toHaveLength(2);
  });

  it('drills down into a slice from the list and from the ring', () => {
    const onSelect = vi.fn();
    const { container } = render(<Donut portions={SLICES} total={4} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aseo' }));
    fireEvent.click(shapes(container)[0]!);

    expect(onSelect.mock.calls).toEqual([[2], [1]]);
  });

  it('cannot drill into a slice without an id, or when nobody listens', () => {
    const { rerender } = render(<Donut portions={SLICES} total={4} onSelect={vi.fn()} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sin clasificar' }).disabled).toBe(
      true,
    );

    rerender(<Donut portions={SLICES} total={4} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Vivienda' }).disabled).toBe(true);
  });

  it('shows the share of the slice under the pointer, and dims the others', () => {
    const { container } = render(<Donut portions={SLICES} total={4} />);

    fireEvent.pointerMove(container.firstElementChild!, { clientX: 10, clientY: 10 });
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Vivienda' }));

    expect(screen.getByText('75% del total')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aseo' }).className).toContain('opacity-40');
    const cleaning = shapes(container)[1]!;
    expect(cleaning.getAttribute('fill') ?? cleaning.getAttribute('stroke')).toContain('color-mix');
  });

  it('hides the hint when the pointer leaves', () => {
    const { container } = render(<Donut portions={SLICES} total={4} />);

    fireEvent.pointerEnter(shapes(container)[0]!);
    expect(screen.getByText('75% del total')).toBeTruthy();

    fireEvent.pointerLeave(container.firstElementChild!);
    expect(screen.queryByText('75% del total')).toBeNull();
  });

  it('can leave the list out and keep only the ring', () => {
    render(<Donut portions={SLICES} total={4} isListVisible={false} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img').getAttribute('class')).toContain('mx-auto');
  });
});
