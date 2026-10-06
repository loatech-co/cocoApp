// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { donutArcs, Donut, donutSector } from './donut';

afterEach(cleanup);

/**
 * The geometry of the donut, with numbers.
 *
 * What is checked cannot be seen by eye: that all the layers end in the same
 * place, that nobody eats the gap of what is still unclassified, that
 * a zero slice does not draw a tiny mark. A bug in any of the
 * three shows on screen as "something odd is going on with the donut" and does not say what.
 */
const portion = (name: string, value: number) => ({ id: null, name, value });

describe('The donut arcs', () => {
  it('split the turn in proportion to the value', () => {
    const arcs = donutArcs([portion('a', 75), portion('b', 25)], 100);

    expect(arcs.map((a) => a.percentage)).toEqual([75, 25]);
    expect(arcs[0]!.fraction).toBeCloseTo(0.75);
    expect(arcs[1]!.fraction).toBeCloseTo(0.25);
  });

  it('sorts largest first, whatever the input order', () => {
    const arcs = donutArcs([portion('chica', 10), portion('grande', 90)], 100);

    expect(arcs.map((a) => a.name)).toEqual(['grande', 'chica']);
  });

  it('each slice starts where the previous one ends', () => {
    // It is what makes the cut that is SEEN —the starting edge of the one
    // on top— fall where the data says and not half a degree further.
    const arcs = donutArcs([portion('a', 50), portion('b', 30), portion('c', 20)], 100);

    expect(arcs[0]!.from).toBeCloseTo(0);
    expect(arcs[1]!.from).toBeCloseTo(0.5);
    expect(arcs[2]!.from).toBeCloseTo(0.8);
  });

  it('every layer ends where the data ends', () => {
    /*
      The layer invariant, which is what makes the cut straight.

      Each slice is painted from its place up to where ALL the
      data ends, not up to where it ends, and the next one covers it. That way no
      cut is an edge against the background —where antialiasing lets a dark hairline
      through— but the starting edge of the one on top over opaque color.
    */
    const arcs = donutArcs([portion('a', 50), portion('b', 30), portion('c', 20)], 100);

    for (const arc of arcs) expect(arc.to).toBeCloseTo(1);
  });

  it('the total rules over the sum: what is missing stays as a gap', () => {
    // Two slices of 30 with a total of 100 do not close the ring. Closing it
    // would say all the spending is in those two categories, and it is not.
    const arcs = donutArcs([portion('a', 30), portion('b', 30)], 100);

    // The layers stop at 60 %: the remaining 40 % is the gap.
    for (const arc of arcs) expect(arc.to).toBeCloseTo(0.6);
  });

  it('a slice without value draws nothing', () => {
    // Zero slices go at the end of the order, so they start right where
    // the data ends and their layer measures zero. A tiny mark of something that is not there
    // is worse than drawing nothing.
    const arcs = donutArcs([portion('a', 100), portion('vacía', 0)], 100);
    const empty = arcs.find((a) => a.name === 'vacía');

    expect(empty?.to).toBeCloseTo(empty?.from ?? -1);
    expect(donutSector(empty?.from ?? 0, empty?.to ?? 0)).toBe('');
  });

  it('no layer goes past one turn', () => {
    // The rounding case: slices that add up to a bit more than the total.
    const arcs = donutArcs([portion('a', 99.9), portion('b', 0.2)], 100);

    for (const arc of arcs) expect(arc.to).toBeLessThanOrEqual(1);
  });

  it('without a total, the sum of the slices is split', () => {
    // It happens when the cut brings no total: the ring closes with what there is, which
    // is better than an empty ring.
    const arcs = donutArcs([portion('a', 3), portion('b', 1)], 0);

    expect(arcs.map((a) => a.percentage)).toEqual([75, 25]);
    expect(arcs[0]!.to).toBeCloseTo(1);
  });

  it('does not crash without slices', () => {
    expect(donutArcs([], 0)).toEqual([]);
  });
});

/**
 * The sector: two arcs and TWO RADIAL CUTS.
 *
 * It is what was rewritten, and that is why it is tested. The ring used to be drawn with
 * a stroke and `stroke-dasharray`, and there the cut of each dash is set by the
 * browser perpendicular to the tangent of an APPROXIMATED curve: on a
 * stroke 26 wide, half a degree of error in that tangent moves the
 * outer edge relative to the inner one and the cut looks skewed.
 *
 * A sector does not depend on any tangent: its cuts are the segment between
 * the inner edge and the outer one AT THE SAME ANGLE.
 */
describe('The donut sector', () => {
  /** The points of a `d`, in pairs. */
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

  it("starts at twelve o'clock and moves clockwise", () => {
    const [startOutside, endOutside] = points(donutSector(0, 0.25));
    // The canvas measures (68 + 13) * 2 + 4 = 166, so the center falls at 83.
    const CENTER = 83;

    // It starts at the top: same x as the center, and above it.
    expect(startOutside![0]).toBeCloseTo(CENTER);
    expect(startOutside![1]).toBeLessThan(CENTER);

    // A quarter turn later it is on the right, level with the center.
    expect(endOutside![0]).toBeGreaterThan(CENTER);
    expect(endOutside![1]).toBeCloseTo(CENTER);
  });

  it('both cuts are radial: their ends share an angle', () => {
    // What makes the cut straight by construction. If the outer edge
    // and the inner one did not fall at the same angle, the cut would come out
    // skewed: it is exactly the flaw the dashed drawing had.
    // The canvas measures (68 + 13) * 2 + 4 = 166, so the center falls at 83.
    const CENTER = 83;
    const angle = ([x, y]: [number, number]): number => Math.atan2(y - CENTER, x - CENTER);

    for (const [from, to] of [
      [0, 0.25],
      [0.13, 0.9],
      [0.5, 0.75],
    ]) {
      const [a, b, c, d] = points(donutSector(from!, to!));

      // `a` and `d` are the starting cut; `b` and `c` the ending one.
      //
      // Four decimals and no more because the `d` is written with three: on a
      // radius of 55, a thousandth of a unit is about two hundred-thousandths of a
      // radian, which is a thousandth of a degree. Asking for more would be measuring the
      // rounding of the text, not the geometry.
      expect(angle(a!)).toBeCloseTo(angle(d!), 4);
      expect(angle(b!)).toBeCloseTo(angle(c!), 4);
    }
  });

  it('past half a turn it asks for the large arc', () => {
    // Without that flag the browser picks the short arc and the slice comes out
    // inverted: a 300° one would be drawn as a 60° one.
    expect(donutSector(0, 0.9)).toMatch(/A 81 81 0 1 1/);
    expect(donutSector(0, 0.3)).toMatch(/A 81 81 0 0 1/);
  });

  it('a zero slice draws nothing', () => {
    expect(donutSector(0.4, 0.4)).toBe('');
    expect(donutSector(0.4, 0.2)).toBe('');
  });
});

describe('Donut', () => {
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
