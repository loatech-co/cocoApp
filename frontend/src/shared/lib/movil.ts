import { useSyncExternalStore } from 'react';

import { isInNativeApp } from './bridge';

/**
 * EL CORTE. Uno solo, y hace DOS preguntas.
 *
 * ── Por qué la orientación y no solo el ancho ───────────────────────────────
 * Una tableta mide entre 768 y 1024 puntos de ancho. Un iPad en vertical queda
 * POR ENCIMA de cualquier línea de 767px, así que recibiría la pantalla de
 * escritorio —riel a la izquierda y todo— dentro de una columna con forma de
 * teléfono. Girado, el mismo aparato mide de 1024 a 1366 y ahí el escritorio
 * es lo correcto.
 *
 * Así que la pregunta nunca es "cuánto mide" sino "cuánto mide Y de qué lado
 * está". 1024 es el techo porque es el iPad más ancho en vertical: el de
 * 12,9 pulgadas, 1024×1366.
 *
 * ── Por qué dos cadenas y no una negada ─────────────────────────────────────
 * Porque `not` sobre una lista de condiciones no se comporta como uno espera
 * en una consulta de medios. Escritas a mano, las dos tienen que ser
 * COMPLEMENTARIAS: nada puede caer en las dos ni en ninguna. Eso no se confía
 * a la vista — lo comprueba `movil.test.ts` sobre un barrido de tamaños.
 *
 * ── Dónde vive la copia de CSS ──────────────────────────────────────────────
 * En `index.css`, como `@custom-variant movil` y `@custom-variant escritorio`.
 * Tailwind sí sabe ponerle nombre a una consulta de medios, así que en las
 * clases se escribe `movil:` y `escritorio:` y la cadena no se repite por el
 * proyecto. Esta de aquí y la de allá son las dos únicas; la prueba comprueba
 * que digan lo mismo, carácter por carácter.
 */
export const CONSULTA_MOVIL = '(max-width: 767px), (orientation: portrait) and (max-width: 1024px)';

export const CONSULTA_ESCRITORIO =
  '(min-width: 1025px), (orientation: landscape) and (min-width: 768px)';

function suscribir(alCambiar: () => void): () => void {
  const lista = window.matchMedia(CONSULTA_MOVIL);
  lista.addEventListener('change', alCambiar);
  return () => lista.removeEventListener('change', alCambiar);
}

/**
 * Si estamos por debajo del corte.
 *
 * Se usa para MONTAR o no montar —la barra de abajo, el panel de secciones—,
 * no para dar estilo: para eso están las variantes `movil:` y `escritorio:`.
 *
 * Montar y no esconder, porque un riel escondido con CSS sigue siendo nueve
 * enlaces en el orden de tabulación, y un panel escondido con CSS es una
 * segunda copia de cada `id` que hay dentro.
 */
export function useEsMovil(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA_MOVIL).matches,
    // En un render sin ventana no hay ancho que medir. Escritorio es la
    // respuesta menos destructiva: pinta el riel, que es lo que el HTML
    // servido ya tenía.
    () => false,
  );
}

/**
 * Si la web corre DENTRO de la app del teléfono.
 *
 * Vive junto a `useEsMovil` porque responde a la misma clase de pregunta: qué
 * se MONTA. Embebida, la barra de abajo, el techo y la hoja de la cuenta no
 * se montan —la barra nativa y la pestaña «Más» hacen ese papel—.
 *
 * No es un `useSyncExternalStore`: la respuesta no cambia en toda la vida de
 * la página. El `User-Agent` y el puente los pone la app al crear el webview,
 * antes de cargar nada, y no hay forma de entrar o salir de la app sin
 * recargar el documento.
 */
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- rename belongs to step 7.2
export function useEnLaApp(): boolean {
  return isInNativeApp();
}
