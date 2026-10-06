import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * Una fila de un panel: un icono, un nombre y lo que venga detrás.
 *
 * 48 de alto, que es la medida de una fila que se toca con el pulgar, y todo
 * el ancho del panel: así el icono de la derecha —un más, un galón— puede ser
 * pequeño, porque el blanco no es él sino la fila entera.
 *
 * ── Por qué hay una clase Y un componente ───────────────────────────────────
 * Unas filas son `<button>` —agregar un atajo, cerrar la sesión— y otras son
 * `<Link>` —ir a una sección, abrir un movimiento—, y lo que comparten es el
 * ASPECTO. Las de botón usan `PanelRow`; las de enlace, la clase, igual que
 * `BLOQUE` y `SUPERFICIE_FLOTANTE`. Un solo sitio donde cambia.
 */
export const PANEL_ROW_CLASS =
  'flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-muted';

/** Rojo solo para lo que no se deshace: cerrar la sesión. */
const TONES = {
  normal: '',
  danger: 'font-medium text-destructive hover:bg-destructive/10',
} as const;

export function PanelRow({
  tone = 'normal',
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'className'> & { tone?: keyof typeof TONES }) {
  // Sin `className`: lo que la fila necesite distinto es un tono más aquí.
  return <button type={type} className={cn(PANEL_ROW_CLASS, TONES[tone])} {...props} />;
}
