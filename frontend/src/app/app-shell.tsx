import { useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { SearchPanel } from '@/features/transactions/components/search-panel';
import { TransactionModalOnDemand } from '@/features/transactions/components/transaction-modal-on-demand';
import { useAuth } from '@/shared/api/auth-context';
import { registerBridge } from '@/shared/api/native-bridge';
import { invalidateDerived } from '@/shared/api/query-keys';
import { t } from '@/shared/lib/i18n';
import { useIsInNativeApp, useIsMobile } from '@/shared/lib/mobile';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { Button } from '@/shared/ui/atoms/button';
import { Logo } from '@/shared/ui/atoms/logo';
import { ToastStack } from '@/shared/ui/molecules/toast';

import { AccountPanel } from './account-panel';
import { BottomBar } from './bottom-bar';
import { SideRail } from './side-rail';
import { type ShellState, useShellState } from './use-shell-state';

/**
 * The shell.
 *
 * ── What changes at the breakpoint ──────────────────────────────────────────
 * Four things, and only four:
 *
 *   1. the rail DISAPPEARS — there is no width to give it, and what it did is
 *      split between the bottom bar, the shortcuts and the account sheet;
 *   2. a top bar with the brand appears, and stays stuck on top on scroll;
 *   3. the body keeps the bar's gap at its foot;
 *   4. the bottom bar appears, with its three sheets and the (+) sheet.
 *
 * ── Why there is no hamburger menu any more ─────────────────────────────────
 * Because it was a third place where the same list lived. The rail has it on
 * desktop; on the phone the bottom bar carries the everyday things, the
 * shortcuts carry ANY page —and are built by hand, which beats an order we
 * decided— and the avatar sheet carries the admin. A full-screen panel with
 * the nine sections was the fourth way to reach the same pages, and the least
 * used.
 *
 * ── What the shell does NOT do ──────────────────────────────────────────────
 * Style its children. The panel, the top bar and the bar are components with
 * their own rules; the shell says WHERE they go and who steps aside when
 * another opens. That last part is in `index.css`, derived with `:has()` from
 * the surface's own state, because a lock that depends on a class set by a
 * script stays on the day a close forgets to remove it.
 */
/**
 * The reminder that one is looking as a regular user.
 *
 * ── Why a banner is needed ──────────────────────────────────────────────────
 * Because the mode TAKES things off the screen —the Admin group, the My account
 * badge, the two panel pages— and what is missing is not seen. Without this,
 * an admin who turned it on and came back half an hour later would find the
 * app without a panel and no clue why: the natural conclusion is that
 * something broke, not that one turned it off oneself.
 *
 * That is why it carries the way out INSIDE, and not only in the avatar menu:
 * whoever does not remember turning it on will not go looking for where it
 * turns off either.
 *
 * ── And why it is not red ───────────────────────────────────────────────────
 * Because nothing failed. It is a deliberate, reversible state, which is
 * exactly what the theme's warning tone says.
 */
function UserView() {
  const { isViewingAsUser, setViewAsUser } = useAuth();

  if (!isViewingAsUser) return null;

  return (
    <Alert variant="warning" className="mb-4 items-center">
      <Eye aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span>{t('shell.userView.notice')}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setViewAsUser(false)}
        >
          {t('common.backToAdmin')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * What the phone app can ask of the web: go to a route and open the search.
 *
 * ── Why it is a child component of the shell and not of the router ─────────
 * There is ONE call to `registerBridge`, because `window.__coco` is a single
 * object and two registrations would overwrite each other. And the two things
 * it publishes are born in different places: `navigate` belongs to the router,
 * and opening the search is shell state. The shell is the element of `/` and
 * lives inside the router, so from here both are reachable; from `router.tsx`
 * the search state cannot be reached without pulling it out of the shell.
 *
 * What is lost is navigating BEFORE there is a session —the shell does not
 * mount without one—, and it is not needed: without a session there is no
 * page to draw, and the app, if it does not find `__coco`, loads the route by
 * URL, which amounts to the same.
 *
 * Outside the app it installs nothing: `registerBridge` checks.
 */
function NavigationBridge({ openSearch }: { openSearch: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      registerBridge({
        navigate: (route) => void navigate(route),
        openSearch,
        captured: () => invalidateDerived(queryClient),
      }),
    [navigate, openSearch, queryClient],
  );

  return null;
}

export function AppShell() {
  const isMobile = useIsMobile();
  /**
   * Inside the phone app.
   *
   * The native bar and the «Más» tab do what the top bar, the bottom bar, the
   * shortcuts sheet and the account sheet do here, so they are NOT mounted:
   * not hidden with CSS, which would leave nine links in the tab order and a
   * fixed bar under another. The search and the sheet are, because the native
   * «Buscar» tab opens the one here.
   */
  const isEmbedded = useIsInNativeApp();
  const shell = useShellState();

  return (
    // The whole page is THE MATERIAL —the same color as the card and the
    // rail— and the content opens inside it as a well. The whole shell is
    // explained at the `<main>` further down.
    <div className="flex min-h-dvh flex-col bg-sidebar">
      {/* ── Rail — desktop ───────────────────────────────────────────────────
          It is MOUNTED or not, never hidden with CSS: a hidden rail is still
          nine links in a phone's tab order, and its names are still twice on
          the page. */}
      {!isMobile && !isEmbedded && (
        <SideRail isCollapsed={shell.isCollapsed} onToggle={shell.toggleBar} />
      )}

      {/* ── Top bar — phone ──────────────────────────────────────────────────
          Stuck on top, which is when it must be clear which layer goes above:
          that is why the shadow goes on the STUCK element and not on any
          other. */}
      {isMobile && !isEmbedded && <PhoneTop />}

      {/* ── THE GAP WHERE THE WELL OPENS ────────────────────────────────────
          On desktop this box measures EXACTLY the window and does not
          scroll: what scrolls is the well, inside. That is what lets the
          well show four corners, because if the whole page scrolled, the top
          one would go as soon as someone scrolled down a screen.

          The 20px on top, right and bottom are the material around the
          well. On the left they are not written: there the gap is not made
          by a margin but by the rail, which is 14rem with 3 of its own
          padding, so between the last thing it writes and the well's edge
          there are 12.

          That they differ is correct and not an oversight: on the other three
          sides the gap is the distance to the WINDOW EDGE, and on the left it
          is the distance to what is written in the rail. They are two
          different relations and have no reason to match. */}
      <div
        className={cn(
          'flex flex-1 flex-col transition-[padding]',
          'desktop:h-dvh desktop:py-5 desktop:pr-5',
          // Without a rail —a tablet inside the app— the left gap is the same
          // as on the other three sides.
          isEmbedded ? 'desktop:pl-5' : shell.isCollapsed ? 'desktop:pl-16' : 'desktop:pl-56',
        )}
      >
        <main
          className={cn(
            // The top padding is SMALLER than the sides, and it is not an
            // oversight. It was 40px, the same as the side on wide screens,
            // decided when the content sat directly on the page: back then
            // that gap was the only thing between the title and the window
            // edge. Now, above it, there are 20px of material and the well's
            // edge, which already do that job; the 40 inside added to them
            // and left the title floating in 60px of nothing.
            'w-full flex-1 px-4 pt-5 desktop:px-8 desktop:pb-16 desktop:pt-6 lg:px-10',
            // ── THE WELL ────────────────────────────────────────────────────
            // The content does not sit on the page: it opens INSIDE it. The
            // page is the material —the same color as the card and the
            // rail— and this is the hollow, one tone below.
            //
            // Two things come out of that and cannot be separated. One, the
            // rail stops being a column stuck to the side and reads as the
            // frame around the content, because it is the same material and
            // surrounds it on all four sides. And two, the card —material
            // again— stands out from the background on its own, without a
            // border.
            //
            // The rounded edge is what sells the trick. With the well stuck
            // to the window edges, the color change is a vertical line and
            // reads as two columns; separated and with curved corners, it
            // reads as one piece set inside another. That is why the margin
            // and the radius are one decision and not two.
            //
            // 14px, and it is the only exception to the app's standard
            // radius: it is the largest container there is, and 10 on an
            // edge as long as the window is barely visible. It is registered,
            // with its reason, in `components/ui/radius.test.ts`.
            'bg-background desktop:rounded-xl',
            // The well is what scrolls, not the page. `min-h-0` is what allows
            // it: without it, a child of a flex column is as tall as its
            // content and stretches the outer box, which is exactly the one
            // that cannot grow.
            'desktop:min-h-0 desktop:overflow-y-auto',
            // ── Clips, does not offer ───────────────────────────────────────
            // `auto` does not contain an overflow: it OFFERS it as a
            // scrollbar. And since the whole page lives in here, the effect
            // is indistinguishable from scrolling the document: the title
            // moves left and the shell is knocked out of square.
            //
            // Worse: when a document overflows sideways, the phone's layout
            // viewport GROWS, and with it everything fixed. A wide table was
            // not clipped: it stretched the bottom bar to 659px inside a
            // 400px screen and pushed two of its slots past the edge.
            //
            // `clip` refuses instead of offering. Only on X, because the page
            // must keep scrolling vertically. The consequence is the one
            // wanted: whatever is really wider gets CUT. A phone screen does
            // not scroll sideways; whatever has wide content brings its own
            // scroll.
            'mobile:overflow-x-clip mobile:pb-[var(--bar-gap)]',
          )}
        >
          <UserView />
          <Outlet />
        </main>
      </div>

      {isMobile && !isEmbedded && <PhoneSheets shell={shell} />}

      {/* The search and the sheet, on the phone AND inside the app: there
          the native bar opens them through `NavigationBridge`. */}
      {(isMobile || isEmbedded) && <SearchAndSheet shell={shell} />}

      {isEmbedded && <NavigationBridge openSearch={shell.openSearch} />}

      <ToastStack />
    </div>
  );
}

/** The bottom bar and its two sheets: only on the phone, outside the app. */
function PhoneSheets({ shell }: { shell: ShellState }) {
  const { user } = useAuth();
  return (
    <>
      <BottomBar
        name={user?.displayName ?? user?.email ?? '?'}
        isSearchOpen={shell.isSearchOpen}
        onSearch={() => shell.setIsSearchOpen(true)}
        // Straight to the expense, no menu in between: it is the only live
        // option of the two the wide-screen menu offers.
        onNewExpense={() => shell.setSheet(null)}
        isShortcutsOpen={shell.isShortcutsOpen}
        onShortcuts={() => shell.setIsShortcutsOpen(true)}
        isAccountOpen={shell.isAccountOpen}
        onAccount={() => shell.setIsAccountOpen(true)}
      />

      {/* The three sheets are always mounted, open or closed: what slides
          cannot be rebuilt on every render, or it appears instead of
          arriving. */}
      <BottomSheet
        isOpen={shell.isShortcutsOpen}
        title={t('shell.shortcuts.title')}
        head={shell.header}
        onClose={() => shell.setIsShortcutsOpen(false)}
      >
        {shell.body}
      </BottomSheet>

      <AccountPanel isOpen={shell.isAccountOpen} onClose={() => shell.setIsAccountOpen(false)} />
    </>
  );
}

/** The search and the transaction sheet the shell opens. */
function SearchAndSheet({ shell }: { shell: ShellState }) {
  return (
    <>
      <SearchPanel
        isOpen={shell.isSearchOpen}
        onClose={() => shell.setIsSearchOpen(false)}
        // Once the transaction is found, the search is over: the sheet closes
        // and the transaction sheet opens in its place. Leaving it below
        // would force closing it later, and with the sheet on top it is no
        // longer visible.
        onSelect={(transaction) => {
          shell.setIsSearchOpen(false);
          shell.setSheet(transaction);
        }}
      />

      {/* This one is mounted when it opens. It does not slide —it enters with
          its own scrim's animation, which runs on existing—, and always
          mounted it would keep its queries alive on every phone screen. */}
      {shell.sheet !== undefined && (
        <TransactionModalOnDemand
          isOpen
          transaction={shell.sheet}
          defaultType="expense"
          onClose={() => shell.setSheet(undefined)}
        />
      )}
    </>
  );
}

function PhoneTop() {
  return (
    <header
      data-armazon="techo"
      // The brand ALONE, and centered. It used to share the row with the
      // menu button, which no longer exists: with a single element, leaving
      // it on the left leaves half the strip empty to its right and the top
      // bar reads as a row missing something. Centered it is a cover.
      className="sticky top-0 z-20 flex h-16 items-center justify-center bg-sidebar px-4 shadow-[var(--docked-shadow)]"
    >
      <Logo className="h-7 w-auto text-sidebar-active" />
    </header>
  );
}
