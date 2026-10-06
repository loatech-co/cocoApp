import { useState } from 'react';

/**
 * Reacciona a que algo de fuera cambie, DURANTE el render.
 *
 * ── Lo que reemplaza ────────────────────────────────────────────────────────
 * Esto:
 *
 *   useEffect(() => { setX(valorDeFuera); }, [valorDeFuera]);
 *
 * que es la forma en que esta aplicación reiniciaba el estado de una ficha al
 * abrirla, seguía un campo de texto al valor que le llegaba, o cerraba los
 * paneles al cambiar de página. Doce sitios, el mismo gesto.
 *
 * ── Por qué en el render y no en un efecto ──────────────────────────────────
 * Un efecto corre DESPUÉS de pintar. Así que la secuencia era: se pinta la
 * ficha con los datos del movimiento anterior, corre el efecto, se vuelve a
 * pintar con los buenos. Un fotograma con datos viejos, y un render de más
 * cada vez. En una ficha de quince campos eso es quince estados cambiando en
 * dos tandas en vez de una.
 *
 * Ajustar el estado durante el render es lo que React documenta para este
 * caso: si se llama a un `setState` mientras el componente se está pintando,
 * React descarta ese render y vuelve a empezar con el estado nuevo, antes de
 * tocar el DOM. No hay fotograma intermedio.
 *
 * ── Es fiel a `useEffect`, a propósito ──────────────────────────────────────
 * Dos cosas que podrían haberse «mejorado» y no se han tocado, porque esto
 * sustituye a doce efectos que ya funcionaban y la regla era no cambiar lo que
 * hace la pantalla:
 *
 *   · Se dispara también al MONTAR, como un efecto. Una ficha que se monta ya
 *     abierta se rellena igual que una que se abre después.
 *   · Compara cada elemento con `Object.is`, como el array de dependencias.
 *     Un objeto nuevo con el mismo contenido cuenta como cambio, igual que
 *     contaba antes.
 *
 * ── Qué NO es ───────────────────────────────────────────────────────────────
 * No es para efectos de verdad: una suscripción, una petición, un recurso del
 * navegador que haya que soltar. Eso sigue siendo un `useEffect` con su
 * limpieza. Esto es solo para «cuando cambie esto, el estado tiene que decir
 * aquello».
 */
export function useOnChange(signature: readonly unknown[], react: () => void): void {
  // `null` y no `firma`: así la primera pasada siempre cuenta como cambio y la
  // reacción corre al montar, que es lo que hacía el efecto.
  const [previous, setPrevious] = useState<readonly unknown[] | null>(null);

  const hasChanged =
    previous?.length !== signature.length ||
    previous.some((value, i) => !Object.is(value, signature[i]));

  if (hasChanged) {
    setPrevious(signature);
    react();
  }
}
