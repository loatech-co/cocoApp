import { t } from '@/shared/lib/i18n';
import type { Section } from '@/shared/lib/sections';
import { cn } from '@/shared/lib/utils';
import { Logo, CompactLogo } from '@/shared/ui/atoms/logo';
import { RailToggle } from '@/shared/ui/atoms/rail-toggle';

import { SectionLink, AccountMenu, useSections } from './navigation';

/**
 * The desktop rail.
 *
 * 14rem. It was 13, and it was too narrow: "Centros de costos" nearly touched
 * the well's edge, and the rail read as a column squeezed next to the content
 * instead of the frame around it. The rail has no background of its own —it
 * is the page— and what bounds it is the well's edge.
 */
export function SideRail({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const { daily, admin } = useSections();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 flex flex-col p-3 transition-[width]',
        isCollapsed ? 'w-16' : 'w-56',
      )}
    >
      <RailHeader isCollapsed={isCollapsed} onToggle={onToggle} />

      {isCollapsed && <RailToggle isCollapsed onToggle={onToggle} />}

      <nav className="flex flex-1 flex-col gap-1" aria-label={t('shell.rail.label')}>
        <SectionLinks sections={daily} isCollapsed={isCollapsed} />

        {admin.length > 0 && (
          <>
            {/* Collapsed, the label does not fit: the rule stays, which is what
                is really needed —saying that what is below is something
                else—. */}
            {isCollapsed ? (
              <hr className="my-3 border-sidebar-border" />
            ) : (
              <p className="mt-6 mb-1 px-3 text-xs font-semibold text-sidebar-muted">
                {t('shell.rail.admin')}
              </p>
            )}
            <SectionLinks sections={admin} isCollapsed={isCollapsed} />
          </>
        )}
      </nav>

      {/* At the foot, not in a separate header: a strip the full width of
          the screen only to say which account one is signed in with is a
          lot of strip. Down here it takes a place that was already empty. */}
      <div className="mt-4 border-t border-sidebar-border pt-3">
        <AccountMenu isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}

function RailHeader({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  return (
    <div
      className={cn(
        'mb-8 flex items-center pt-3',
        // Collapsed, the brand is centered because there is nothing else in the
        // row; expanded it goes to the left and the collapse button to the
        // other end, which is where one looks for it.
        // And the row has no RIGHT padding: the collapse button aligns on
        // its own, with its own negative margin. See below.
        isCollapsed ? 'justify-center px-0' : 'justify-between pl-2 pr-0',
      )}
    >
      {isCollapsed ? (
        <CompactLogo className="size-7 text-sidebar-active" />
      ) : (
        <>
          {/* It is given HEIGHT: the logo is 3.82:1 and fixing its width would
              leave it too short to read. It uses `sidebar-active`, the
              color with which each theme says "here": British green on the
              light rail, lime on the dark one. */}
          <Logo className="h-7 w-auto text-sidebar-active" />
          <RailToggle isCollapsed={false} onToggle={onToggle} />
        </>
      )}
    </div>
  );
}

function SectionLinks({
  sections,
  isCollapsed,
}: {
  sections: readonly Section[];
  isCollapsed: boolean;
}) {
  return sections.map(({ to, label, Icon, exact: isExact }) => (
    <SectionLink key={to} to={to} isExact={isExact} isCollapsed={isCollapsed} title={label}>
      <Icon
        className="size-4.5 shrink-0"
        fill="currentColor"
        fillOpacity={0.18}
        strokeWidth={1.75}
        aria-hidden={true}
      />
      {!isCollapsed && label}
    </SectionLink>
  ));
}
