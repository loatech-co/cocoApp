import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';

import { PANEL_ROW_CLASS } from '@/shared/ui/atoms/panel-row';

/**
 * A row that leads to a page: icon and name.
 *
 * Exported because Mi cuenta, inside the phone app, offers the admin sections
 * with this same row —this sheet is not mounted there—. A component and not a
 * copy: the first copy would learn to mark something the other would not.
 */
export function LinkRow({
  Icon,
  to,
  onNavigate,
  children,
}: {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  to: string;
  /**
   * Closing the sheet belongs to the row and not to the shell.
   *
   * The shell closes whatever covers the page every time the ROUTE changes,
   * and two of these rows do not change it: when already on Mi cuenta, going
   * to its Seguridad anchor leaves the route the same and the sheet would have
   * stayed open on top of the place it had just led to. Outside a sheet there
   * is nothing to close, and that is why it is optional.
   */
  onNavigate?: () => void;
  children: string;
}) {
  return (
    <Link to={to} onClick={onNavigate} className={PANEL_ROW_CLASS}>
      <Icon className="size-4 shrink-0 opacity-70" aria-hidden={true} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}
