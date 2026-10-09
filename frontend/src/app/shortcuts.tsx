import { ChevronLeft, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { MAX_SHORTCUTS, addShortcut, useShortcuts } from '@/shared/lib/shortcuts';
import { Button } from '@/shared/ui/atoms/button';
import { Input } from '@/shared/ui/atoms/input';
import { showToast } from '@/shared/ui/molecules/toast';

import { ShortcutGrid } from './shortcut-grid';
import { ShortcutPicker } from './shortcut-picker';
import type { Mode, ShortcutPage } from './shortcut-types';
import { useShortcutDrag } from './use-shortcut-drag';

export type { ShortcutPage as PaginaDeAtajo } from './shortcut-types';

interface ShortcutsOptions {
  isOpen: boolean;
  /** The navigation leaves, as they are, in their order. */
  library: readonly ShortcutPage[];
  /** What there is before anyone touches anything. */
  defaults: readonly string[];
  /** A tile was picked: the host closes the panel. */
  onGo: () => void;
}

/**
 * The shortcuts.
 *
 * ── What this is and what it is not ─────────────────────────────────────────
 * It is the only slot in the bar that is not somewhere else already: the rest
 * of its slots are sections that also live in the menu. This answers "what do
 * I do now" instead of "where can I go".
 *
 * The surface HAS NO NAME in the copy. What one has are SHORTCUTS, shown as
 * TILES. "Panel", "sheet" or "drawer" describe the mechanics and stay in the
 * comments.
 *
 * ── The library is the navigation leaves ────────────────────────────────────
 * The same ones, read when drawing. A second list of the product's pages
 * would drift from the navigation the first time a screen is added, and the
 * drift would not be seen.
 *
 * ── Customizing is WHICH pages and IN WHICH ORDER ───────────────────────────
 * One editing mode, two ways in and one way out:
 *
 *   enter     the «Editar» pill, or holding a tile — "I want to change this"
 *             is one intent however many ways it has of being said
 *   inside    the tiles wiggle, drag over each other, each one shows a minus,
 *             and an «Añadir atajo» slot appears
 *   exit      the «Listo» pill, from either of the two screens
 *
 * Picking a page is a step INSIDE arranging: the chevron goes back to it and
 * «Listo» leaves editing altogether.
 */
export function useShortcutsSurface({ isOpen, library, defaults, onGo }: ShortcutsOptions): {
  header: ReactNode;
  body: ReactNode;
} {
  const routes = useShortcuts(defaults);
  const [mode, setMode] = useState<Mode>('galeria');
  const [search, setSearch] = useState('');
  const drag = useShortcutDrag(mode);

  // The three states are ephemeral, like the store: a screen that reopens in
  // the middle of an edit is a screen that reopens wrong.
  useOnChange([isOpen], () => {
    if (!isOpen) {
      setMode('galeria');
      setSearch('');
      drag.setDrag(null);
    }
  });

  // A saved route whose page no longer exists drops out here, when drawing:
  // who knows which pages exist is whoever draws, not the store.
  const tiles = routes
    .map((route) => library.find((p) => p.route === route))
    .filter((p): p is ShortcutPage => p !== undefined);

  const header = (
    <ShortcutsHeader mode={mode} setMode={setMode} search={search} setSearch={setSearch} />
  );

  const body =
    mode === 'eligiendo' ? (
      <ShortcutPicker
        available={availableFor(library, routes, search)}
        search={search}
        onAdd={add}
      />
    ) : (
      <ShortcutGrid tiles={tiles} mode={mode} drag={drag} setMode={setMode} onGo={onGo} />
    );

  return { header, body };
}

const normal = (t: string): string => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Only what is NOT a tile already: a row for a page one already has could
 * only mean "remove", and removing is what the minus is for.
 */
function availableFor(
  library: readonly ShortcutPage[],
  routes: readonly string[],
  search: string,
): ShortcutPage[] {
  return library
    .filter((p) => !routes.includes(p.route))
    .filter((p) => search.trim() === '' || normal(p.label).includes(normal(search.trim())));
}

function add(route: string): void {
  if (!addShortcut(route)) {
    // The answer comes when the question is asked: no permanent counter and no
    // disabled control, which answers nothing when pressed.
    showToast(t('shell.shortcuts.fullTitle'), {
      detail: t('shell.shortcuts.fullDetail', { max: MAX_SHORTCUTS }),
      tone: 'warning',
    });
  }
}

function ShortcutsHeader({
  mode,
  setMode,
  search,
  setSearch,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  search: string;
  setSearch: (search: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-10.5 items-center gap-2">
        {mode === 'eligiendo' && (
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            onClick={() => setMode('arreglando')}
            aria-label={t('shell.shortcuts.back')}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
        )}

        <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
          {mode === 'eligiendo' ? t('shell.shortcuts.add') : t('shell.shortcuts.title')}
        </h2>

        {mode === 'galeria' ? (
          <Button type="button" variant="tool" size="sm" onClick={() => setMode('arreglando')}>
            {t('common.edit')}
          </Button>
        ) : (
          <Button type="button" variant="accent" size="sm" onClick={() => setMode('galeria')}>
            {t('shell.shortcuts.done')}
          </Button>
        )}
      </div>

      {/* The header goes past the 78 floor only because its CONTENT is taller,
          which is the only reason it should. */}
      {mode === 'eligiendo' && <FindPage search={search} setSearch={setSearch} />}
    </div>
  );
}

function FindPage({ search, setSearch }: { search: string; setSearch: (search: string) => void }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('shell.shortcuts.searchPlaceholder')}
        aria-label={t('shell.shortcuts.searchPlaceholder')}
        className="pl-9"
        autoFocus
      />
    </div>
  );
}
