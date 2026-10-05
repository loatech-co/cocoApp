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
export const MAXIMO_DE_ATAJOS = 9;

const VACIO: readonly string[] = [];

let rutas: readonly string[] | null = null;
const oyentes = new Set<() => void>();

function anunciar(): void {
  for (const oyente of oyentes) oyente();
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/**
 * Deja lo de fábrica, solo la primera vez.
 *
 * Lo de fábrica lo decide quien dibuja, porque depende de quién ha entrado:
 * las páginas de administración no existen para todo el mundo.
 */
export function sembrarAtajos(porDefecto: readonly string[]): void {
  if (rutas !== null) return;
  rutas = porDefecto.slice(0, MAXIMO_DE_ATAJOS);
}

export function leerAtajos(): readonly string[] {
  return rutas ?? VACIO;
}

/** Devuelve `false` si no cupo. Quien llama decide qué contestar. */
export function anadirAtajo(ruta: string): boolean {
  const actuales = leerAtajos();
  if (actuales.includes(ruta)) return true;
  if (actuales.length >= MAXIMO_DE_ATAJOS) return false;

  rutas = [...actuales, ruta];
  anunciar();
  return true;
}

export function quitarAtajo(ruta: string): void {
  const actuales = leerAtajos();
  if (!actuales.includes(ruta)) return;

  rutas = actuales.filter((r) => r !== ruta);
  anunciar();
}

export function moverAtajo(desde: number, hasta: number): void {
  const actuales = leerAtajos();
  if (desde === hasta) return;
  if (desde < 0 || hasta < 0 || desde >= actuales.length || hasta >= actuales.length) return;

  const siguiente = [...actuales];
  const [movido] = siguiente.splice(desde, 1);
  if (movido === undefined) return;
  siguiente.splice(hasta, 0, movido);

  rutas = siguiente;
  anunciar();
}

/** Para las pruebas: deja el almacén como recién cargada la página. */
export function olvidarAtajos(): void {
  rutas = null;
  anunciar();
}

export function useAtajos(porDefecto: readonly string[]): readonly string[] {
  // La siembra tiene que ocurrir antes de la primera lectura, y quien tiene lo
  // de fábrica es quien dibuja. Es idempotente —solo actúa si nadie sembró—,
  // así que repetirla en un render doble no cambia nada.
  sembrarAtajos(porDefecto);
  return useSyncExternalStore(suscribir, leerAtajos, leerAtajos);
}
