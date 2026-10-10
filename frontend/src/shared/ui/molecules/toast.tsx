import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { useSyncExternalStore, type ComponentType } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/lib/utils';
import type { AlertTone } from '@/shared/ui/atoms/alert';
import { FLOATING_SURFACE, SURGE } from '@/shared/ui/foundations/surface';

/**
 * A toast.
 *
 * ── What for ────────────────────────────────────────────────────────────────
 * To answer something that was just pressed and has no other answer. The case
 * that brought it in: asking for a tenth shortcut.
 *
 * And not a counter ("9 de 9", which spends permanent room on a rule that
 * matters once in forty) nor a disabled control (which answers nothing when
 * pressed, because it cannot be pressed). The answer arrives when the
 * question is asked.
 *
 * ── One card, however many times it is pressed ──────────────────────────────
 * The same toast does not stack: it restarts its clock. Ten taps in a row in
 * the same place are insistence, not ten pieces of news.
 *
 * ── Where it goes ───────────────────────────────────────────────────────────
 * On the phone, ABOVE the bottom bar: the usual corner is exactly where the
 * bar is.
 *
 * ── Title and detail ────────────────────────────────────────────────────────
 * Two lines and not one: the title says WHAT happened in three words —it is
 * read out of the corner of the eye, which is how toasts are read— and the
 * detail explains. With a single line one had to choose between being legible
 * at a glance or being useful.
 *
 * The detail is optional. A toast that needs no explanation does not make one
 * up.
 *
 * ── The tones ───────────────────────────────────────────────────────────────
 * The same four as the inline alert, with THREE signals at once for each one,
 * on purpose:
 *
 * · A round pill in the severity's color, with its glyph on top. Color alone
 *   is not enough: one in twelve men cannot tell red from green, so the shape
 *   —check, triangle, cross— says the same thing another way.
 * · A glow of the same color coming in from the left edge, which tints the
 *   card without coloring it.
 * · The pill's halo, which is the same color at 15 %.
 *
 * ── Why the surface is NOT tinted whole ─────────────────────────────────────
 * Because a floating toast is on top of everything else, and what says it is
 * on top is the shadow over the popover's color. Tinting the whole rectangle
 * red breaks that reading: it stops looking like a layer and starts looking
 * like a sign. The edge glow gives the color without losing the elevation.
 */

interface ToastEntry {
  id: number;
  title: string;
  detail?: string | undefined;
  tone: AlertTone;
}

/**
 * The glyph of each tone, and why they are NOT the inline alert's.
 *
 * There the icon sits bare over the text, so it carries its own outline
 * —`CircleCheck`, `CircleAlert`—. Here it goes INSIDE a pill that is already a
 * circle: with a circular icon, the result is two concentric circles and the
 * glyph gets lost. So here go the bare strokes.
 */
const GLYPHS: Record<AlertTone, ComponentType<{ className?: string }> | null> = {
  default: null,
  destructive: X,
  warning: TriangleAlert,
  success: Check,
  info: Info,
};

/**
 * The three colors of each tone, written out and not computed.
 *
 * Tailwind does not see a class built with a template —`bg-${tone}` does not
 * exist in the final CSS—, so every combination is written whole. It is the
 * same reason the chips' swatches are a table.
 */
const COLORS: Record<AlertTone, { pill: string; halo: string; glow: string }> = {
  default: { pill: '', halo: '', glow: '' },
  destructive: {
    pill: 'bg-destructive text-destructive-foreground',
    halo: 'bg-destructive/15',
    glow: 'bg-gradient-to-r from-destructive/20 to-transparent to-65%',
  },
  warning: {
    pill: 'bg-warning text-warning-foreground',
    halo: 'bg-warning/15',
    glow: 'bg-gradient-to-r from-warning/20 to-transparent to-65%',
  },
  success: {
    pill: 'bg-success text-success-foreground',
    halo: 'bg-success/15',
    glow: 'bg-gradient-to-r from-success/20 to-transparent to-65%',
  },
  info: {
    pill: 'bg-info text-info-foreground',
    halo: 'bg-info/15',
    glow: 'bg-gradient-to-r from-info/20 to-transparent to-65%',
  },
};

let toasts: ToastEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** How long it stays on screen. Enough to read two lines, not so long it gets in the way. */
const DURATION_MS = 5000;

function notify(): void {
  for (const listener of listeners) listener();
}

function scheduleDismiss(id: number): void {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      toasts = toasts.filter((a) => a.id !== id);
      notify();
    }, DURATION_MS),
  );
}

export function showToast(
  title: string,
  options: { detail?: string; tone?: AlertTone } = {},
): void {
  const { detail, tone = 'default' } = options;

  // The same toast restarts its clock instead of stacking. It is compared by
  // what it SAYS —title and detail—, not by the tone: the same text with
  // another tone would be the same toast told twice.
  const existing = toasts.find((a) => a.title === title && a.detail === detail);
  if (existing) {
    scheduleDismiss(existing.id);
    return;
  }

  const toast: ToastEntry = { id: nextId++, title, detail, tone };
  toasts = [...toasts, toast];
  scheduleDismiss(toast.id);
  notify();
}

/** For tests: leaves the stack empty and with no pending clocks. */
export function clearToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  toasts = [];
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useToasts(): ToastEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => toasts,
  );
}

/**
 * The stack. It is mounted ONCE, against the `body`, from the shell.
 *
 * Against the `body` and not inside the current screen because a toast
 * outlives what raised it: closing the panel that asked for it need not take
 * it down along the way.
 */
export function ToastStack() {
  const toasts = useToasts();
  if (typeof document === 'undefined' || toasts.length === 0) return null;

  return createPortal(
    <div
      // Above the backdrop of a surface (50) and the bar (15): a toast that
      // answers something pressed INSIDE a panel has to show over the panel.
      className="pointer-events-none fixed bottom-[var(--bajo-la-barra)] right-6 z-[60] flex flex-col gap-2 mobile:left-4 mobile:right-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  );
}

function Toast({ toast }: { toast: ToastEntry }) {
  const Glyph = GLYPHS[toast.tone];
  const color = COLORS[toast.tone];

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-lg p-4',
        FLOATING_SURFACE,
        SURGE,
        'mobile:max-w-none desktop:w-[26rem]',
      )}
    >
      {/*
        The glow, on its own layer behind the content.

        On the same layer as the card one would have to choose between the
        popover's color and the gradient, because both are `background`;
        here the popover stays as the background and the gradient rests on
        top, with the text in front.
      */}
      {color.glow && (
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute inset-0', color.glow)}
        />
      )}

      {Glyph && (
        <span
          aria-hidden="true"
          className={cn(
            'relative grid size-10 shrink-0 place-items-center rounded-full',
            color.halo,
          )}
        >
          <span className={cn('grid size-7 place-items-center rounded-full', color.pill)}>
            <Glyph className="size-4" />
          </span>
        </span>
      )}

      <span className="relative min-w-0">
        <span className="block text-sm font-semibold leading-tight">{toast.title}</span>
        {toast.detail && (
          <span className="mt-1 block text-sm leading-snug text-muted-foreground">
            {toast.detail}
          </span>
        )}
      </span>
    </div>
  );
}
