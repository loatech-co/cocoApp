import { useSyncExternalStore } from 'react';

/**
 * The shortcuts: which pages and in what order.
 *
 * ── What is kept and what is not ────────────────────────────────────────────
 * Only PATHS. The icon and the name come from the navigation, which is the
 * product's only list of pages: a second one would drift from it the first
 * time a screen is added, and the drift would be invisible.
 *
 * A saved path that no longer exists is dropped when drawing, not here: the
 * one that knows which pages exist is the one that paints.
 *
 * ── Why it is ephemeral on purpose ──────────────────────────────────────────
 * It lives as long as the tab and is forgotten on reload. That way an edit is
 * seen the moment it is made, and whoever reviews after someone who reordered
 * everything still gets the factory set.
 *
 * ── And why this has tests ──────────────────────────────────────────────────
 * Because every edit is a write followed by a RE-READ: the render draws again
 * from here. The DOM is never the record, it is a picture of it. If the screen
 * stops responding, the first thing to check is that this can be read back,
 * before looking at a single line of the surface.
 */

/**
 * Nine: three rows of three, what fits without scrolling on the shortest phone
 * this is drawn for. A panel stops being a layer over the page as soon as it
 * has to be scrolled to be read whole.
 */
export const MAX_SHORTCUTS = 9;

const EMPTY: readonly string[] = [];

let paths: readonly string[] | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sets the factory set, only the first time.
 *
 * The factory set is decided by whoever draws, because it depends on who has
 * signed in: the administration pages do not exist for everyone.
 */
export function seedShortcuts(defaults: readonly string[]): void {
  if (paths !== null) return;
  paths = defaults.slice(0, MAX_SHORTCUTS);
}

export function readShortcuts(): readonly string[] {
  return paths ?? EMPTY;
}

/** Returns `false` if it did not fit. The caller decides what to answer. */
export function addShortcut(path: string): boolean {
  const current = readShortcuts();
  if (current.includes(path)) return true;
  if (current.length >= MAX_SHORTCUTS) return false;

  paths = [...current, path];
  announce();
  return true;
}

export function removeShortcut(path: string): void {
  const current = readShortcuts();
  if (!current.includes(path)) return;

  paths = current.filter((r) => r !== path);
  announce();
}

export function moveShortcut(from: number, to: number): void {
  const current = readShortcuts();
  if (from === to) return;
  if (from < 0 || to < 0 || from >= current.length || to >= current.length) return;

  const next = [...current];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return;
  next.splice(to, 0, moved);

  paths = next;
  announce();
}

/** For the tests: leaves the store as if the page had just loaded. */
export function forgetShortcuts(): void {
  paths = null;
  announce();
}

export function useShortcuts(defaults: readonly string[]): readonly string[] {
  // Seeding has to happen before the first read, and whoever holds the
  // factory set is whoever draws. It is idempotent —it only acts if nobody
  // seeded—, so repeating it in a double render changes nothing.
  seedShortcuts(defaults);
  return useSyncExternalStore(subscribe, readShortcuts, readShortcuts);
}
