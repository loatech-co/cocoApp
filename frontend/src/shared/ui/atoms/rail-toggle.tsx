import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/**
 * Collapse and expand the desktop rail.
 *
 * Expanded it sits top right, next to the logotype, and what is aligned is
 * the ICON, not its touch area: the button measures 36 and the icon 18, so it has
 * 9 of air on each side, and the negative margin (`-mr-2.25`, 9px) pushes out the touch
 * area so that the edge of the icon falls on that of the navigation
 * rows. With the button flush with the rail the icon read as hanging loose.
 *
 * Collapsed it takes the width of the rail, above the sections.
 */
export function RailToggle({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const label = isCollapsed ? t('ui.railToggle.expand') : t('ui.railToggle.collapse');
  const Icon = isCollapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={cn(
        'grid place-items-center rounded-lg text-sidebar-muted transition-colors hover:text-sidebar-foreground',
        isCollapsed ? 'mb-2 h-9 w-full' : '-mr-2.25 size-9 shrink-0',
      )}
    >
      <Icon className="size-4.5" aria-hidden="true" />
    </button>
  );
}
