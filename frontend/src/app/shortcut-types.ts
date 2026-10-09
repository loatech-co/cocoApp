import type { ComponentType } from 'react';

/** A page that can be a shortcut: a navigation leaf, as is. */
export interface ShortcutPage {
  route: string;
  label: string;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

/** Gallery, arranging and picking a page: the only editing mode and its step. */
export type Mode = 'galeria' | 'arreglando' | 'eligiendo';
