import { Plus } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { PanelRow } from '@/shared/ui/atoms/panel-row';

import type { ShortcutPage } from './shortcut-types';

/** The list of pages that are not a tile yet, to add one. */
export function ShortcutPicker({
  available,
  search,
  onAdd,
}: {
  available: readonly ShortcutPage[];
  search: string;
  onAdd: (route: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {available.map(({ route, label, Icon }) => (
        <li key={route}>
          {/* The WHOLE row is the control: 48 tall and the full width of the
              panel. That is why the plus on the right can be small. It is
              the same one the account sheet and the search sheet use, so the
              class lives in one place. */}
          <PanelRow onClick={() => onAdd(route)}>
            <Icon className="size-4 shrink-0 opacity-70" aria-hidden={true} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </PanelRow>
        </li>
      ))}

      {available.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {search.trim() === '' ? t('shell.shortcuts.nothingLeft') : t('shell.shortcuts.noMatch')}
        </p>
      )}
    </ul>
  );
}
