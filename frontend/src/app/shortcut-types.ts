import type { ComponentType } from 'react';

/** Una página que puede ser un atajo: una hoja de la navegación, tal cual. */
export interface ShortcutPage {
  route: string;
  label: string;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

/** Galería, arreglo y elección de página: el único modo de edición y su paso. */
export type Mode = 'galeria' | 'arreglando' | 'eligiendo';
