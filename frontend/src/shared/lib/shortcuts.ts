import { useSyncExternalStore } from 'react';

/**
 * Los atajos: qué páginas y en qué orden.
 *
 * ── Qué se guarda y qué no ──────────────────────────────────────────────────
 * Solo RUTAS. El icono y el nombre salen de la navegación, que es la única
 * lista de páginas del producto: una segunda se separaría de ella la primera
 * vez que se añada una pantalla, y la separación sería invisible.
 *
 * Una ruta guardada que ya no existe se descarta al dibujar, no aquí: quien
 * sabe qué páginas hay es quien pinta.
 *
 * ── Por qué es efímero a propósito ──────────────────────────────────────────
 * Vive lo que vive la pestaña y se olvida al recargar. Así una edición se ve
 * en el momento en que se hace, y quien revise después de alguien que lo
 * reordenó todo sigue recibiendo lo de fábrica.
 *
 * ── Y por qué esto tiene pruebas ────────────────────────────────────────────
 * Porque cada edición es una escritura seguida de una RELECTURA: el render
 * vuelve a dibujar desde aquí. El DOM nunca es el registro, es una foto suya.
 * Si la pantalla deja de responder, lo primero que hay que comprobar es que
 * esto se pueda leer de vuelta, antes de mirar una sola línea de la superficie.
 */

/**
 * Nueve: tres filas de tres, lo que cabe sin desplazar en el teléfono más
 * corto para el que está dibujado esto. Un panel deja de ser una capa sobre la
 * página en cuanto hay que desplazarlo para leerlo entero.
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
 * Deja lo de fábrica, solo la primera vez.
 *
 * Lo de fábrica lo decide quien dibuja, porque depende de quién ha entrado:
 * las páginas de administración no existen para todo el mundo.
 */
export function seedShortcuts(defaults: readonly string[]): void {
  if (paths !== null) return;
  paths = defaults.slice(0, MAX_SHORTCUTS);
}

export function readShortcuts(): readonly string[] {
  return paths ?? EMPTY;
}

/** Devuelve `false` si no cupo. Quien llama decide qué contestar. */
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

/** Para las pruebas: deja el almacén como recién cargada la página. */
export function forgetShortcuts(): void {
  paths = null;
  announce();
}

export function useShortcuts(defaults: readonly string[]): readonly string[] {
  // La siembra tiene que ocurrir antes de la primera lectura, y quien tiene lo
  // de fábrica es quien dibuja. Es idempotente —solo actúa si nadie sembró—,
  // así que repetirla en un render doble no cambia nada.
  seedShortcuts(defaults);
  return useSyncExternalStore(subscribe, readShortcuts, readShortcuts);
}
