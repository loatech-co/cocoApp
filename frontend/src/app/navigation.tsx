import { Eye, LogOut, ScrollText, ShieldCheck, Tags, UserCog } from 'lucide-react';
import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useHasAccounts } from '@/features/profile/api/preferences';
import { useAuth } from '@/shared/api/auth-context';
import { t } from '@/shared/lib/i18n';
import { MY_ACCOUNT, SECTIONS, ADMIN_SECTIONS, type Section } from '@/shared/lib/sections';
import { cn } from '@/shared/lib/utils';
import { Menu, MenuOption, MenuSeparator } from '@/shared/ui/molecules/menu';

/**
 * The navigation: the sections, the row that draws them and the account menu.
 *
 * ── Why in a module of its own and not inside the shell ─────────────────────
 * Because THREE places use them: the desktop rail, the phone panel and the
 * bottom bar. Two copies start out equal and drift apart —one learns that a
 * section depends on a preference and the other does not—, and then the same
 * app offers different things depending on where one comes in.
 */

/**
 * Which sections exist for whoever is signed in.
 *
 * `library` is ALL of its leaves, in menu order. The shortcuts come from it:
 * a second list of the product's pages would drift from this one the first
 * time a screen is added, and the drift would not be seen.
 */
export function useSections(): {
  daily: readonly Section[];
  admin: readonly Section[];
  library: readonly Section[];
} {
  const { isAdmin } = useAuth();
  const hasAccounts = useHasAccounts();

  const daily = SECTIONS.filter((s) => s.requires !== 'cuentas' || hasAccounts);
  const admin = isAdmin ? ADMIN_SECTIONS : [];

  return { daily, admin, library: [...daily, ...admin, MY_ACCOUNT] };
}

export function SectionLink({
  to,
  isExact,
  isCollapsed = false,
  title,
  children,
}: {
  to: string;
  isExact: boolean;
  isCollapsed?: boolean;
  /** The section's name. Collapsed, it is the only thing left to tell it by. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={isExact}
      title={isCollapsed ? title : undefined}
      aria-label={isCollapsed ? title : undefined}
      className={({ isActive }) =>
        cn(
          // Soft corners, not a pill: in a narrow bar the pill eats the width at
          // the sides and the text ends up stuck to the icon.
          'flex items-center gap-2.5 rounded-lg py-2.5 text-sm font-medium transition-colors',
          // On the phone the row grows to 48: the height of a row that is
          // tapped, above the 42 floor because here there is height to spare
          // and a list of nine is run through with the thumb.
          'mobile:min-h-[48px]',
          isCollapsed ? 'justify-center px-0' : 'px-3',
          // ── Only the SELECTED one gets a background ─────────────────────
          // Hovering paints none. It used `sidebar-hover`, which in dark is
          // a #1e3b30 green, and in a four-row column that is a green
          // rectangle jumping from one to another with the mouse: it weighs
          // as much as the place one is at and competes with it.
          //
          // A background is for saying «you are here», which is a state and
          // lasts. A hover lasts as long as the cursor takes to pass, and for
          // that the cheapest thing there is suffices: the text and its icon
          // LIGHTEN, from `sidebar-muted` to `sidebar-foreground`. Not to
          // pure white —#e8edeb, not #fff— because full-ink white on a dark
          // column weighs more than the content one came to read.
          //
          // The icon lightens on its own: it uses `currentColor`.
          //
          // The two used to share a background and differed by the text
          // color, so hovering the section one was already in changed
          // nothing, and hovering any other looked like having navigated.
          //
          // The active one gets `--sidebar-active`, the color with which this
          // theme says "you are here".
          //
          // ── But WASHED, not solid ───────────────────────────────────────
          // It was a block filled with that color with dark ink on top. With
          // the lime accent that is a rectangle of the app's strongest color
          // lit permanently, in the column one looks at sideways: it weighed
          // more than the content, which is what one came to read. And a
          // color always at full volume stops signaling.
          //
          // Now the TEXT carries the color, which is what has to be read,
          // and the background is a FLAT wash of the same color.
          //
          // A gradient and an inner edge were tried, and both were too much:
          // the gradient gives the background a direction the row does not
          // have —nothing goes left to right there— and the edge draws a box
          // around something that is not a control, only the place one is at.
          // What is needed is that it stands out from the rest, and the wash
          // is enough for that.
          isActive
            ? 'bg-sidebar-active/15 font-semibold text-sidebar-active'
            : 'text-sidebar-muted hover:text-sidebar-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * The account menu.
 *
 * ── Why it repeats what is already in the navigation ────────────────────────
 * Because the question answered here is not "where do I go" but "which
 * account am I signed in with?", and it is also the only place to sign out.
 *
 * The email goes under the name because two people can share a name and not
 * an email.
 */
export function AccountMenu({ isCollapsed = false }: { isCollapsed?: boolean }) {
  return (
    <Menu
      label={t('shell.account.yours')}
      width="md"
      align="left"
      direction="up"
      boxClassName="w-full"
      triggerClassName={cn(
        // No background on hover, like the sections: it is the same column,
        // and a green showing up only here would read as a control from
        // another family.
        'flex w-full min-w-0 items-center gap-2.5 rounded-lg py-2 text-left outline-none',
        'mobile:min-h-[42px]',
        isCollapsed ? 'justify-center px-0' : 'px-2',
      )}
      trigger={() => <AccountTrigger isCollapsed={isCollapsed} />}
    >
      {(close) => <AccountOptions close={close} />}
    </Menu>
  );
}

function AccountTrigger({ isCollapsed }: { isCollapsed: boolean }) {
  const { user } = useAuth();
  const name = user?.displayName ?? user?.email ?? '?';
  return (
    <>
      <Avatar name={name} />
      {!isCollapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">
            {user?.displayName ?? '—'}
          </span>
          {user?.email && (
            <span className="block truncate text-2xs text-sidebar-muted">{user.email}</span>
          )}
        </span>
      )}
    </>
  );
}

function AccountOptions({ close }: { close: () => void }) {
  const { isAdmin, isRealAdmin, isViewingAsUser, setViewAsUser, signOut } = useAuth();
  const navigate = useNavigate();

  // The `void` in front of `navigate` is not decoration: in react-router 7
  // `navigate` returns a promise, and here it is called from an `onClick`
  // that cannot await it. The `void` says it is on purpose —navigating is
  // one way with no return— and it is what tells this apart from a promise
  // someone forgot to handle.
  function goTo(route: string): void {
    close();
    void navigate(route);
  }

  return (
    <>
      <MenuOption Icon={UserCog} onClick={() => goTo('/account')}>
        {t('shell.account.myAccount')}
      </MenuOption>

      <MenuOption Icon={Tags} onClick={() => goTo('/cost-centers')}>
        {t('shell.sections.costCenters')}
      </MenuOption>

      {isAdmin && (
        <>
          <MenuOption Icon={ShieldCheck} onClick={() => goTo('/admin')}>
            {t('shell.sections.users')}
          </MenuOption>
          <MenuOption Icon={ScrollText} onClick={() => goTo('/admin/audit-log')}>
            {t('shell.sections.auditLog')}
          </MenuOption>
        </>
      )}

      <MenuSeparator />

      {/*
        ── See the app as someone who administers nothing sees it ───────
        It shows with the REAL role, not the effective one: with the view
        on, `isAdmin` is false, and with that condition the switch would
        vanish exactly when it is needed to turn it off.

        It goes down here, with sign out and not with the pages: it leads
        nowhere, it changes how everything else looks.
      */}
      {isRealAdmin && (
        <MenuOption
          Icon={isViewingAsUser ? ShieldCheck : Eye}
          onClick={() => {
            close();
            setViewAsUser(!isViewingAsUser);
            // Turned on from an admin screen, staying would mean staring at a
            // «you do not have access». It goes to the dashboard, which is
            // where someone who administers nothing starts from.
            if (!isViewingAsUser) void navigate('/');
          }}
        >
          {isViewingAsUser ? t('common.backToAdmin') : t('shell.account.viewAsUser')}
        </MenuOption>
      )}

      <MenuOption Icon={LogOut} isDestructive onClick={() => void signOut()}>
        {t('shell.account.signOut')}
      </MenuOption>
    </>
  );
}

/**
 * Avatar with the initials.
 *
 * There are no profile photos in the product, so a generic person image
 * would be noise: it identifies nobody. Initials do, and they also confirm
 * which account one is signed in with, which is the question one asks on
 * seeing an avatar.
 */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      title={name}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground',
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}
