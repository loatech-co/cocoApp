import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { type Transaction } from '@/shared/api/generated/model';
import { useOnChange } from '@/shared/lib/on-change';

import { useSections } from './navigation';
import { useShortcutsSurface } from './shortcuts';
import { readSidenavCollapsed, writeSidenavCollapsed } from './sidenav-storage';

type Setter<T> = (value: T) => void;

/** What the shell has open, and how it opens and closes. */
export interface ShellState {
  isCollapsed: boolean;
  toggleBar: () => void;
  isShortcutsOpen: boolean;
  setIsShortcutsOpen: Setter<boolean>;
  isSearchOpen: boolean;
  setIsSearchOpen: Setter<boolean>;
  isAccountOpen: boolean;
  setIsAccountOpen: Setter<boolean>;
  sheet: Transaction | null | undefined;
  setSheet: Setter<Transaction | null | undefined>;
  openSearch: () => void;
  header: ReactNode;
  body: ReactNode;
}

export function useShellState(): ShellState {
  const { daily, library } = useSections();
  const location = useLocation();

  /**
   * The collapsed bar.
   *
   * It is remembered in `localStorage` and not in the URL or on the server:
   * it is a preference of THIS screen, of this moment. Pasting someone a link
   * should not collapse their bar, and changing it has no reason to travel
   * over the network.
   */
  const [isCollapsed, setIsCollapsed] = useState(readSidenavCollapsed);

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  /**
   * The sheet the shell has open.
   *
   * `undefined` is closed, `null` is a new one and a transaction is that one.
   * It is the same convention the dashboard uses, on purpose: opening an
   * expense from the bar's (+) or from a search result cannot be a different
   * sheet or form than opening it from the table.
   */
  const [sheet, setSheet] = useState<Transaction | null | undefined>(undefined);

  // Changing page closes whatever is covering it. A sheet that outlives its
  // own link leaves the person looking at the shortcuts of a screen that is
  // no longer underneath.
  useOnChange([location.pathname], () => {
    setIsShortcutsOpen(false);
    setIsSearchOpen(false);
    setIsAccountOpen(false);
  });

  // Stable across renders: it is what the bridge publishes, and a
  // `useEffect` that depends on it has no reason to register again on every
  // paint.
  const [openSearch] = useState(() => () => setIsSearchOpen(true));

  function toggleBar(): void {
    setIsCollapsed((wasCollapsed) => {
      writeSidenavCollapsed(!wasCollapsed);
      return !wasCollapsed;
    });
  }

  const { header, body } = useShortcutsSurface({
    isOpen: isShortcutsOpen,
    library: library.map(({ to, label, Icon }) => ({
      route: to,
      label,
      Icon,
    })),
    // The defaults are the everyday things. Admin is set up once and hardly
    // touched: it is in the menu, and whoever uses it adds it from there.
    defaults: daily.map((s) => s.to),
    onGo: () => setIsShortcutsOpen(false),
  });

  return {
    isCollapsed,
    toggleBar,
    isShortcutsOpen,
    setIsShortcutsOpen,
    isSearchOpen,
    setIsSearchOpen,
    isAccountOpen,
    setIsAccountOpen,
    sheet,
    setSheet,
    openSearch,
    header,
    body,
  };
}
