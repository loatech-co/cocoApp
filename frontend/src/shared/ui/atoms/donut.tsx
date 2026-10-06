import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';

/**
 * The colors of the slices. They live in `index.css` because they change with
 * the theme: in light the first one is the brand's pine, and in dark it has to be
 * light or the slice blends into the card and the donut looks empty.
 *
 * And they are a ramp of their OWN, separate from the theme's: these slices paint
 * large areas, and a color that stands out well as a 2px stroke can be
 * invisible as a fill.
 */
const PALETTE = [
  'var(--dona-1)',
  'var(--dona-2)',
  'var(--dona-3)',
  'var(--dona-4)',
  'var(--dona-5)',
] as const;
/*
  ── The canvas is SQUARE and fitted to the ring ─────────────────────────────
  The names live outside the SVG, in their own list, so the drawing does not
  need to reserve room for them. The canvas used to be much wider than
  the ring —so the labels and their leader lines would fit— and the ring ended
  up taking less than half of what the card measured.
*/
const RADIO = 68;
const THICKNESS = 26;
const SIDE = (RADIO + THICKNESS / 2) * 2 + 4;
const CENTER = SIDE / 2;
/** The two edges of the ring. */
const OUTSIDE = RADIO + THICKNESS / 2;
const INSIDE = RADIO - THICKNESS / 2;

export interface DonutArc extends DonutPortion {
  color: string;
  fraction: number;
  percentage: number;
  /** Where it starts, in turns. 0 is twelve o'clock. */
  from: number;
  /** Where what it PAINTS ends, which is where all the data ends. */
  to: number;
}

/**
 * A point on the ring. `f` goes from 0 —twelve o'clock— to 1, clockwise.
 *
 * It starts at the top and not at three o'clock because that is where one starts
 * reading a clock, and a donut too.
 */
function point(f: number, radio: number): [number, number] {
  const angle = f * 2 * Math.PI - Math.PI / 2;
  return [CENTER + radio * Math.cos(angle), CENTER + radio * Math.sin(angle)];
}

/**
 * The outline of a slice: an annular sector, with its two RADIAL cuts.
 *
 * ── Why an outline and not a dashed stroke ──────────────────────────────────
 * The ring used to be drawn with one circle per slice, a `stroke` of 26 and a
 * `stroke-dasharray` that showed only its piece. It is the short way to
 * write a donut and it has a flaw that cannot be tuned away: the browser cuts a
 * dash PERPENDICULAR TO THE TANGENT of the stroke, and that
 * tangent comes from a curve approximated by segments. Half a degree of error
 * in the tangent, on a stroke 26 wide, moves the outer edge
 * several tenths relative to the inner one: the cut looks skewed, or stepped,
 * depending on where the point falls in the approximation. With a thin ring it
 * does not show; with one that measures 38 % of the radius, it does.
 *
 * A sector does not depend on any tangent. Its two cuts are the segment that
 * joins the inner edge to the outer one AT THE SAME ANGLE, so they are
 * radial by construction and cannot be anything else.
 *
 * `A` with the sweep at 1 goes clockwise along the outer edge, and at
 * 0 comes back along the inner one. The large-arc `1` is needed past half a
 * turn: without it, the browser picks the short arc and the slice comes out inverted.
 */
export function donutSector(from: number, to: number): string {
  const sweep = to - from;
  if (sweep <= 0) return '';

  const [x1, y1] = point(from, OUTSIDE);
  const [x2, y2] = point(to, OUTSIDE);
  const [x3, y3] = point(to, INSIDE);
  const [x4, y4] = point(from, INSIDE);
  const largeArc = sweep > 0.5 ? 1 : 0;
  const n = (v: number): string => v.toFixed(3);

  return [
    `M ${n(x1)} ${n(y1)}`,
    `A ${OUTSIDE} ${OUTSIDE} 0 ${largeArc} 1 ${n(x2)} ${n(y2)}`,
    `L ${n(x3)} ${n(y3)}`,
    `A ${INSIDE} ${INSIDE} 0 ${largeArc} 0 ${n(x4)} ${n(y4)}`,
    'Z',
  ].join(' ');
}

/**
 * The arcs of the donut, in paint order.
 *
 * It is a separate function and not a calculation inside the component because it is
 * geometry: it can be tested with numbers, and what needs checking are
 * invariants that the eye does not see —that the layers all reach the same place,
 * that a zero slice draws nothing, that nothing goes past one turn—. It is
 * the same reason the month cells and the pager numbers
 * live outside their components.
 *
 * ── Every slice, without grouping the tail into an "Others" ────────────────
 * Grouping looked reasonable until it was seen on screen: "Otros (1)" is a
 * made-up name for ONE category that does exist and does have a name, and
 * on top of that it could not be clicked —there is no category to drill into—, so
 * it was the only row in the list that filtered nothing.
 *
 * ── The total rules over the sum of the slices ─────────────────────────────
 * If there is unclassified spending, the ring is left with a GAP instead of spreading it
 * among the others. A closed ring would say that all the spending is in these
 * categories, and it is not.
 *
 * ── Why every slice is painted up to the END of the data ──────────────────
 * Two adjacent sectors that share an edge let the background through along that
 * line: antialiasing splits the pixel between the two and neither covers it
 * fully, so a dark hairline shows up across the ring.
 *
 * So no slice ends where it should: they all run on to where
 * ALL the data ends, and the next one covers them from its own place. The ring is
 * built in layers, like someone painting one wall and then another on top. Every
 * visible cut is then the STARTING edge of the slice on top
 * —just one, and radial— resting on opaque color and never on the background.
 *
 * It has two consequences that cannot be separated from this:
 *
 * · The gap of what is still unclassified is still there, because the layers
 *   end where the data ends and not where the ring ends.
 * · Highlighting a slice has to dim with COLOR and not with opacity: a
 *   translucent layer shows the one underneath, which is the whole previous
 *   slice.
 */
export function donutArcs(portions: DonutPortion[], total: number): DonutArc[] {
  const segments = [...portions]
    .sort((a, b) => b.value - a.value)
    .map((p, i) => ({ ...p, color: PALETTE[i % PALETTE.length] ?? PALETTE[0] }));

  const sum = segments.reduce((s, p) => s + p.value, 0);
  const base = total > 0 ? total : sum || 1;
  // Where the data ends. Never more than one turn: if the slices add up to
  // more than the total —rounding—, the ring closes and that is it.
  const end = Math.min(1, sum / base);

  let covered = 0;

  return segments.map((segment) => {
    const fraction = segment.value / base;
    const from = covered;
    covered += fraction;

    return {
      ...segment,
      fraction,
      percentage: Math.round(fraction * 100),
      from: Math.min(from, end),
      to: end,
    };
  });
}

export interface DonutPortion {
  id: number | null;
  name: string;
  value: number;
}

/**
 * What the spending splits into: a list and a ring.
 *
 * ── Why the list and not labels around it ──────────────────────────────────
 * Names around the ring joined by leader lines were tried. In a card
 * a third of the screen wide they do not fit: either the names get cut until they stop
 * saying anything, or the ring shrinks until the proportion —the only thing a
 * donut answers— can no longer be read.
 *
 * A list sorted from largest to smallest answers the same question better: it
 * comes with the ranking already done, the names fit whole and the ring keeps
 * all the space the column has left over.
 *
 * ── Why the list is only names ──────────────────────────────────────────────
 * Because the order already says which weighs more and the ring already says how much. Repeating it in
 * figures next to each name turns the list into a table worse than a
 * table, and hides the only thing to read at a glance: where the
 * money goes. The exact amount is another question, and it is asked by pointing.
 */
export function Donut({
  portions,
  total,
  isListVisible = true,
  onSelect,
  className,
}: {
  portions: DonutPortion[];
  /** The total of the cut. It rules over the sum of the slices. */
  total: number;
  /** With the list hidden, the ring is centered but does NOT change size. */
  isListVisible?: boolean;
  onSelect?: ((id: number) => void) | undefined;
  className?: string;
}) {
  const { box, card, activeIndex, setActiveIndex, follow, position, isMeasured } =
    useDonutPointer();
  const strokes = donutArcs(portions, total);
  const highlighted = activeIndex === null ? null : strokes[activeIndex];
  const marks = { strokes, activeIndex, setActiveIndex, onSelect };

  return (
    <div
      ref={box}
      className={cn('relative flex h-full items-center gap-4', className)}
      onPointerMove={follow}
      onPointerLeave={() => setActiveIndex(null)}
    >
      {/* The list scrolls inside its card. Without this, with twelve
          concepts it grew taller than the row and spilled out below,
          riding over the transactions table. */}
      {isListVisible && <DonutLegend {...marks} />}

      <DonutRing {...marks} isListVisible={isListVisible} />

      {highlighted && (
        <DonutTooltip
          card={card}
          position={position}
          isMeasured={isMeasured}
          highlighted={highlighted}
        />
      )}
    </div>
  );
}

/** Which slice is highlighted, and what is needed to highlight it or drill into it. */
interface DonutMarks {
  strokes: DonutArc[];
  activeIndex: number | null;
  setActiveIndex: (i: number | null) => void;
  onSelect: ((id: number) => void) | undefined;
}

/** The pointer over the donut and the card that follows it. */
function useDonutPointer() {
  const box = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [tipSize, setTipSize] = useState({ width: 0, height: 0 });

  // It is measured after painting and before the browser draws: in render
  // the card does not exist yet, and in a normal effect a frame would show
  // with it in the wrong place.
  useLayoutEffect(() => {
    if (!card.current) return;
    const { offsetWidth, offsetHeight } = card.current;
    setTipSize((previous) =>
      previous.width === offsetWidth && previous.height === offsetHeight
        ? previous
        : { width: offsetWidth, height: offsetHeight },
    );
  }, [activeIndex]);

  function follow(e: React.PointerEvent): void {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setBounds({ width: r.width, height: r.height });
    setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  // The card jumps to the side opposite the pointer when it does not fit: just following
  // it, it falls off the card at the edges.
  const position = {
    left: Math.max(
      0,
      pointer.x + 14 + tipSize.width <= bounds.width
        ? pointer.x + 14
        : pointer.x - 14 - tipSize.width,
    ),
    top: Math.min(
      Math.max(0, pointer.y - tipSize.height / 2),
      Math.max(0, bounds.height - tipSize.height),
    ),
  };

  return {
    box,
    card,
    activeIndex,
    setActiveIndex,
    follow,
    position,
    isMeasured: tipSize.width !== 0,
  };
}

function DonutLegend({ strokes, activeIndex, setActiveIndex, onSelect }: DonutMarks) {
  return (
    <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
      {strokes.map((segment, i) => {
        const canDrillDown = segment.id !== null && onSelect !== undefined;

        return (
          <li key={segment.id ?? segment.name}>
            <button
              type="button"
              disabled={!canDrillDown}
              title={segment.name}
              onPointerEnter={() => setActiveIndex(i)}
              onClick={() => {
                if (segment.id !== null && onSelect !== undefined) onSelect(segment.id);
              }}
              className={cn(
                'flex w-full min-w-0 items-center gap-2 rounded-md text-left transition-opacity',
                canDrillDown ? 'cursor-pointer' : 'cursor-default',
                activeIndex !== null && activeIndex !== i && 'opacity-40',
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{segment.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DonutRing({ isListVisible, ...marks }: DonutMarks & { isListVisible: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${SIDE} ${SIDE}`}
      /*
        The size comes from the WIDTH, and the height follows it.

        Deriving it from the height —`h-80% w-auto`— looked neater: the donut filled
        its card. But the width that came out of that height knew nothing about the
        list next to it, so the ring took the whole row and
        the names shrank until they disappeared.

        Splitting the WIDTH between the two, each one has its own: the ring
        62 % and the list 38 %. `max-h-full` is the brake in case the card
        turns out shorter than it is wide; the canvas is square, so when it
        shrinks it is still a circle, only smaller.

        To enlarge the ring there are two knobs, and both are outside this
        file or right here: this percentage —which it takes from the list— and
        the width of the column in the dashboard, which it takes from the chart.
      */
      // With the list hidden the ring is CENTERED, it does not grow: growing, the width
      // of the card would stop being the same with and without names and the whole row
      // would rearrange itself every time the button is pressed.
      className={cn('max-h-full w-[62%] shrink-0', !isListVisible && 'mx-auto')}
      role="img"
      aria-label={t('ui.donut.label')}
    >
      {/* The background ring: it is what shows where no slice reaches. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIO}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={THICKNESS}
      />

      {marks.strokes.map((segment, i) => (
        <DonutSlice key={segment.id ?? segment.name} segment={segment} i={i} {...marks} />
      ))}
    </svg>
  );
}

function DonutSlice({
  segment,
  i,
  activeIndex,
  setActiveIndex,
  onSelect,
}: Omit<DonutMarks, 'trazos'> & { segment: DonutArc; i: number }) {
  const canDrillDown = segment.id !== null && onSelect !== undefined;
  const sweep = segment.to - segment.from;
  if (sweep <= 0) return null;

  /*
    ── Dim with COLOR, never with opacity ───────────────────────────
    Highlighting a slice dims the others. With `opacity` they turn
    translucent, and under each one is the whole previous one —the ring
    is painted in layers—, so it would show through. Mixing the
    color with the card's dims it just the same while staying opaque.
    `transition-colors` includes the fill, so it is still
    gradual.
  */
  const color =
    activeIndex !== null && activeIndex !== i
      ? `color-mix(in oklab, ${segment.color} 35%, var(--card))`
      : segment.color;

  const shared = {
    onPointerEnter: () => setActiveIndex(i),
    onClick: () => {
      if (segment.id !== null && onSelect !== undefined) onSelect(segment.id);
    },
    className: cn('transition-colors', canDrillDown && 'cursor-pointer'),
  };

  // The full turn is not a sector: its two cuts would fall in the
  // same place and the arc would be undefined. There it is just a ring.
  return sweep >= 1 ? (
    <circle
      cx={CENTER}
      cy={CENTER}
      r={RADIO}
      fill="none"
      stroke={color}
      strokeWidth={THICKNESS}
      {...shared}
    />
  ) : (
    <path d={donutSector(segment.from, segment.to)} fill={color} {...shared} />
  );
}

function DonutTooltip({
  card,
  position,
  isMeasured,
  highlighted,
}: {
  card: RefObject<HTMLDivElement | null>;
  position: { left: number; top: number };
  /** Its size is known: until then it is not shown. */
  isMeasured: boolean;
  highlighted: DonutArc;
}) {
  return (
    <div
      ref={card}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      className={cn(
        'pointer-events-none absolute z-10 min-w-36 rounded-lg p-3',
        FLOATING_SURFACE,
        // Not measured yet, it is painted invisible: a first frame in the
        // corner and another in its place looks like a jump.
        !isMeasured && 'opacity-0',
      )}
    >
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: highlighted.color }}
        />
        <span className="min-w-0 truncate">{highlighted.name}</span>
      </p>
      <p className="tabular mt-1 font-display text-base font-semibold">
        {formatCOP(highlighted.value)}
      </p>
      <p className="tabular mt-0.5 text-2xs text-muted-foreground">
        {t('ui.donut.ofTotal', { percent: highlighted.percentage })}
      </p>
    </div>
  );
}
