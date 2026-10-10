import { LayoutGrid, Search } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { DASHBOARD } from '@/shared/lib/sections';
import { cn } from '@/shared/lib/utils';
import { BarFab, BarIcon, BarSlotButton, BarSlotLink } from '@/shared/ui/atoms/bar-slot';

import { Avatar } from './navigation';

interface BottomBarProps {
  name: string;
  isSearchOpen: boolean;
  onSearch: () => void;
  onNewExpense: () => void;
  isShortcutsOpen: boolean;
  onShortcuts: () => void;
  isAccountOpen: boolean;
  onAccount: () => void;
}

/** The bar itself: fixed to the bottom edge, over the page and under the top bar. */
const BAR_CLASSES = cn(
  'fixed inset-x-0 bottom-0 flex items-stretch',
  // BELOW the top bar, which is at 20, and on purpose: a dropdown
  // anchored to the top bar is its child, so no z-index inside can beat
  // a sibling of the top bar. The two bars never overlap —one is on top
  // and the other at the foot—, so nothing is lost.
  'z-[15]',
  'bg-sidebar pb-seguro',
  // The bottom padding, and no taller: the bar's row measures exactly 60
  // and the phone's safe area is dead space below, which is exactly what
  // that gap is.
  'border-t border-sidebar-border shadow-[var(--docked-shadow-up)]',
);

/**
 * The bottom bar. The way to reach the everyday things with one hand.
 *
 * ── Five slots, and five is a CEILING, not a goal ───────────────────────────
 * Material caps a navigation bar at five destinations and Apple caps a tab
 * bar at five, both for the same reason: the sixth makes every target too
 * narrow. At 375 wide, five slots are 75×60.
 *
 * ── Only one is a destination; the other four are things one DOES ─────────
 *
 *   Home      the bar's only section
 *   Search    opens a sheet with the field and the results inside
 *   (+)       records an expense, without going through any menu
 *   Shortcuts the pages each person builds
 *   Avatar    its sheet: the profile, the settings and the way out
 *
 * It used to be four sections and a button, and it was backwards from how a
 * phone is used: what is done twenty times a week —noting an expense,
 * searching for one— was two taps away, and what is visited once a month had
 * its fixed slot. The sections that left are still one tap away in the
 * shortcuts, which is exactly what they are for.
 *
 * ── Why the (+) does NOT open a menu ────────────────────────────────────────
 * Because there is only one answer. The «Nuevo movimiento» menu offers
 * expense and income, and income is disabled —«Pronto»—: on the phone that
 * is one more tap to pick the only live option. On the wide screen the menu
 * stays, because there the second tap costs a click and not a gesture, and the
 * day income exists the menu is already written.
 *
 * ── Icons only ──────────────────────────────────────────────────────────────
 * Five 12px words under five drawings are a second row of text competing
 * with the page, and they would flatten the only hierarchy the bar has. Each
 * slot carries its accessible name.
 */
export function BottomBar({
  name,
  isSearchOpen,
  onSearch,
  onNewExpense,
  isShortcutsOpen,
  onShortcuts,
  isAccountOpen,
  onAccount,
}: BottomBarProps) {
  return (
    <nav data-armazon="barra" aria-label={t('shell.bottomBar.label')} className={BAR_CLASSES}>
      <div className="flex flex-1">
        <BarSlotLink
          to={DASHBOARD.to}
          isExact={DASHBOARD.exact}
          label={DASHBOARD.label}
          Icon={DASHBOARD.Icon}
        />
        <BarSlotButton label={t('shell.bottomBar.search')} isOn={isSearchOpen} onClick={onSearch}>
          <BarIcon Icon={Search} />
        </BarSlotButton>
      </div>

      {/* Fixed width: it is what keeps the button in the exact center when
          the groups do not have the same number of slots. */}
      <div className="flex w-18 shrink-0 items-start justify-center">
        <BarFab label={t('shell.bottomBar.newExpense')} onClick={onNewExpense} />
      </div>

      <div className="flex flex-1">
        <BarSlotButton
          label={t('shell.shortcuts.title')}
          isOn={isShortcutsOpen}
          onClick={onShortcuts}
        >
          <BarIcon Icon={LayoutGrid} />
        </BarSlotButton>

        <AccountSlot name={name} isOpen={isAccountOpen} onClick={onAccount} />
      </div>
    </nav>
  );
}

function AccountSlot({
  name,
  isOpen,
  onClick,
}: {
  name: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <BarSlotButton label={t('shell.account.myAccount')} isOn={isOpen} onClick={onClick}>
      {/* Off it takes the bar's dim surface and on the brand color with its
          ink. Never the other way round: when the avatar carried the bar's
          color, the circle vanished and loose initials were left that read
          as the active slot. */}
      <Avatar
        name={name}
        className={cn(
          'size-8',
          isOpen
            ? 'bg-sidebar-active text-sidebar-active-foreground'
            : 'bg-sidebar-hover text-sidebar-foreground',
        )}
      />
    </BarSlotButton>
  );
}
