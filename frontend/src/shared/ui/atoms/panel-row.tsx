import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * A row of a panel: an icon, a name and whatever comes after.
 *
 * 48 high, which is the size of a row tapped with the thumb, and the full
 * width of the panel: that way the icon on the right —a plus, a chevron— can be
 * small, because the target is not it but the whole row.
 *
 * ── Why there is a class AND a component ────────────────────────────────────
 * Some rows are `<button>` —add a shortcut, sign out— and others are
 * `<Link>` —go to a section, open a transaction—, and what they share is the
 * LOOK. The button ones use `PanelRow`; the link ones, the class, just like
 * `BLOQUE` and `SUPERFICIE_FLOTANTE`. A single place where it changes.
 */
export const PANEL_ROW_CLASS =
  'flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-muted';

/** Red only for what cannot be undone: signing out. */
const TONES = {
  normal: '',
  danger: 'font-medium text-destructive hover:bg-destructive/10',
} as const;

export function PanelRow({
  tone = 'normal',
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'className'> & { tone?: keyof typeof TONES }) {
  // No `className`: whatever the row needs to be different is one more tone here.
  return <button type={type} className={cn(PANEL_ROW_CLASS, TONES[tone])} {...props} />;
}
