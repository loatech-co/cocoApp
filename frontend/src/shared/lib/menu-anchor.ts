import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Abrir, cerrar y colocar un desplegable.
 *
 * Es lo que `Menu` sabe hacer y no dibuja: por eso vive en `lib` y no en la
 * interfaz. Lo de dibujar —la superficie, el origen, el ancho— sigue en
 * `shared/ui/molecules/menu.tsx`.
 */

/** Dónde está el disparador en la ventana, medido al abrir. */
export interface Anclaje {
  top: number;
  left: number;
  /** Lo que queda desde el canto derecho del disparador hasta la ventana. */
  derecha: number;
  ancho: number;
}

export function useMenuState(enHoja: boolean) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const [anclaje, setAnclaje] = useState<Anclaje | null>(null);

  // Se mide al abrir: la posición de la caja en la ventana es lo único que
  // hace falta para colocar un panel que ya no depende de ella.
  function medir(): void {
    const r = caja.current?.getBoundingClientRect();
    if (r) {
      setAnclaje({
        top: r.bottom,
        left: r.left,
        derecha: window.innerWidth - r.right,
        ancho: r.width,
      });
    }
  }

  /*
    Cerrar al tocar fuera y con Escape — pero solo cuando el panel cuelga del
    botón. La hoja trae sus cuatro salidas propias —el tirador, el velo,
    Escape y deslizar hacia abajo—, y además vive PORTADA contra el `body`:
    para esta caja, cualquier toque dentro de la hoja es un toque «fuera», así
    que elegir una opción la habría cerrado antes de que el clic llegara.
  */
  useEffect(() => {
    if (!abierto || enHoja) return;

    const fuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto, enHoja]);

  return { abierto, setAbierto, caja, anclaje, medir };
}

/** Dónde se coloca un panel flotante, medido contra la ventana. */
export function panelStyle(
  anclaje: Anclaje,
  anchoPropio: boolean,
  alineado: 'izquierda' | 'derecha',
): CSSProperties {
  // El MISMO ancho que el campo, no un mínimo: un panel más ancho que su
  // disparador se lee como otro elemento, y uno más angosto corta las
  // opciones que el campo sí muestra enteras.
  if (!anchoPropio) {
    return {
      top: `${anclaje.top + 8}px`,
      left: `${anclaje.left}px`,
      width: `${anclaje.ancho}px`,
    };
  }
  /*
    Se ancla por el canto que dice `alineado`, y no siempre por la izquierda.

    Anclando siempre a la izquierda, un panel ancho colgado de un control que
    vive al final de una barra —el rango de fechas— crece hacia fuera de la
    pantalla: o se sale, o el recorte lo deja de la mitad de ancho. Por la
    derecha crece hacia dentro, que es donde hay sitio.

    El tope es siempre lo que queda hasta el borde opuesto: lo que se sale de
    la ventana no se puede pulsar.
  */
  return alineado === 'derecha'
    ? {
        top: `${anclaje.top + 8}px`,
        right: `${anclaje.derecha}px`,
        maxWidth: `calc(100vw - ${anclaje.derecha}px - 1rem)`,
      }
    : {
        top: `${anclaje.top + 8}px`,
        left: `${anclaje.left}px`,
        maxWidth: `calc(100vw - ${anclaje.left}px - 1rem)`,
      };
}
