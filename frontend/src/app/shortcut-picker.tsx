import { Plus } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { PanelRow } from '@/shared/ui/atoms/panel-row';

import type { ShortcutPage } from './shortcut-types';

/** La lista de páginas que aún no son una baldosa, para agregar una. */
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
          {/* La fila ENTERA es el control: 48 de alto y todo el ancho del
              panel. Por eso el más de la derecha puede ser pequeño. Es la
              misma que usan la hoja de la cuenta y la de buscar, así que la
              clase vive en un solo sitio. */}
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
