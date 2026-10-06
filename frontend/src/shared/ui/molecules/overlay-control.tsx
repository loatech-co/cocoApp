import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';

/**
 * La raya entre dos grupos de mandos dentro de la misma pastilla.
 *
 * ── Qué separa ──────────────────────────────────────────────────────────────
 * Moverse de lo que MODIFICA. Pasar al soporte siguiente no cambia nada;
 * agregar y borrar sí, y borrar no se deshace. Seguidos sin nada en medio, las
 * flechas y el más se leen como una sola regleta de cinco botones, y el que
 * está justo después del contador —el más— se pulsa creyendo que es «el
 * siguiente».
 *
 * ── Por qué una raya y no un hueco ──────────────────────────────────────────
 * Un hueco dentro de una pastilla de 40px de alto tiene que ser grande para
 * leerse como separación, y entonces la pastilla crece a lo ancho encima del
 * papel. Un píxel dice lo mismo y no ocupa nada.
 *
 * Va al 25 % de la tinta: tiene que verse como una división, no como un sexto
 * control.
 */
export function SeparadorDeMandos() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-sala-tinta/25" />;
}

/**
 * Un mando que vive SOBRE un documento o sobre el velo oscuro de un visor.
 *
 * No usa la paleta de la aplicación: encima de un recibo —que es blanco— un
 * control claro desaparece. Los mandos de una previsualización los pone quien
 * la usa: la ficha de un movimiento sin guardar quita archivos de la memoria y
 * la de uno guardado los borra del servidor, pero los dos botones son el mismo
 * objeto.
 */
export function BotonOscuro({
  onClick,
  etiqueta,
  deshabilitado = false,
  className,
  children,
}: {
  onClick: () => void;
  etiqueta: string;
  deshabilitado?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      // Redondo: estos mandos viven dentro de una pastilla redonda, y un
      // resaltado cuadrado ahí deja dos esquinas asomando en cada extremo.
      size="sm-icon-round"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn('text-sala-tinta hover:bg-sala-tinta/10 hover:text-sala-tinta', className)}
    >
      {children}
    </Button>
  );
}

/**
 * La lectura entre dos mandos: el porcentaje del zoom, la página. Cifras
 * tabulares, para que «95 %» y «100 %» no muevan los botones de al lado.
 *
 * Con `onClick` es un botón (el porcentaje vuelve al tamaño normal: es donde
 * todo el mundo pulsa cuando se ha perdido ampliando); sin él, solo se lee.
 *
 * | Ancho     | Lo que cabe                                          |
 * | --------- | ---------------------------------------------------- |
 * | `previa`  | «100 %» en letra 2xs, sobre la previsualización      |
 * | `zoom`    | «100 %» en el visor a pantalla completa              |
 * | `paginas` | «Pág. 12 / 30» en el visor                           |
 */
const LECTURAS = {
  previa: 'min-w-[3rem] text-2xs',
  zoom: 'min-w-[3.5rem] text-xs',
  paginas: 'min-w-[4.5rem] text-xs',
} as const;

export function LecturaDeMandos({
  ancho,
  titulo,
  onClick,
  children,
}: {
  ancho: keyof typeof LECTURAS;
  /** La pista al pasar por encima, si se puede pulsar. */
  titulo?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const clase = cn('tabular text-center font-medium text-sala-tinta', LECTURAS[ancho]);
  if (!onClick) return <span className={clase}>{children}</span>;
  return (
    <button type="button" onClick={onClick} title={titulo} className={clase}>
      {children}
    </button>
  );
}
