import { cn } from '@/shared/lib/utils';

/**
 * How much is left.
 *
 * ── Why it is a component ───────────────────────────────────────────────────
 * There were two, written by hand, and they no longer measured the same: the import one
 * 8px high and full width, the receipt-reading one 4px and a fixed 192.
 * They are the same bar at two moments of the same job —reading a document— and
 * they looked like two different things.
 *
 * ── Why it carries `role="progressbar"` and its values ──────────────────────
 * Because a `<div>` that grows says nothing to a screen reader: without
 * `aria-valuenow` it is announced as an empty container, and whoever cannot see the
 * screen has no way of knowing whether the wait is progressing or stuck. The two
 * there were were plain divs.
 *
 * ── Why it is not a `<progress>` ────────────────────────────────────────────
 * For the same reason there are no native `<select>`s in this app: the operating
 * system draws it. On macOS it comes out as a striped blue pill and on Windows a green
 * rectangle, and neither looks like anything here.
 */
export function Progress({
  value,
  label,
  className,
}: {
  /** From 0 to 1. It is clamped: a 1.02 from rounding does not overflow the track. */
  value: number;
  /** What is being waited for. It is the accessible name of the bar. */
  label: string;
  className?: string;
}) {
  const percentage = Math.min(100, Math.max(0, Math.round(value * 100)));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
