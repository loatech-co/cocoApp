import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Abrir, cerrar y colocar un desplegable.
 *
 * Es lo que `Menu` sabe hacer y no dibuja: por eso vive en `lib` y no en la
 * interfaz. Lo de dibujar —la superficie, el origen, el ancho— sigue en
 * `shared/ui/molecules/menu.tsx`.
 */

/** Dónde está el disparador en la ventana, medido al abrir. */
export interface Anchor {
  top: number;
  left: number;
  /** Lo que queda desde el canto derecho del disparador hasta la ventana. */
  right: number;
  width: number;
}

export function useMenuState(isSheet: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  // Se mide al abrir: la posición de la caja en la ventana es lo único que
  // hace falta para colocar un panel que ya no depende de ella.
  function measure(): void {
    const r = box.current?.getBoundingClientRect();
    if (r) {
      setAnchor({
        top: r.bottom,
        left: r.left,
        right: window.innerWidth - r.right,
        width: r.width,
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
    if (!isOpen || isSheet) return;

    const onOutside = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isOpen, isSheet]);

  return { isOpen, setIsOpen, box, anchor, measure };
}

/** Dónde se coloca un panel flotante, medido contra la ventana. */
export function panelStyle(
  anchor: Anchor,
  hasOwnWidth: boolean,
  align: 'left' | 'right',
): CSSProperties {
  /*
    El alto, hasta el borde de abajo de la ventana y ni un píxel más.

    El panel es `fixed` y cuelga del canto inferior del disparador. Abierto
    desde un campo que está a media pantalla en un teléfono, lo que no cabía
    caía fuera de la ventana: ni se veía ni se podía pulsar, y no había nada
    que desplazar para alcanzarlo. Con el tope, el panel se desplaza por
    dentro.
  */
  const heightCap = { maxHeight: `calc(100dvh - ${anchor.top + 16}px)` };
  // El MISMO ancho que el campo, no un mínimo: un panel más ancho que su
  // disparador se lee como otro elemento, y uno más angosto corta las
  // opciones que el campo sí muestra enteras.
  if (!hasOwnWidth) {
    return {
      top: `${anchor.top + 8}px`,
      left: `${anchor.left}px`,
      width: `${anchor.width}px`,
      ...heightCap,
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
  return align === 'right'
    ? {
        top: `${anchor.top + 8}px`,
        right: `${anchor.right}px`,
        maxWidth: `calc(100vw - ${anchor.right}px - 1rem)`,
        ...heightCap,
      }
    : {
        top: `${anchor.top + 8}px`,
        left: `${anchor.left}px`,
        maxWidth: `calc(100vw - ${anchor.left}px - 1rem)`,
        ...heightCap,
      };
}
