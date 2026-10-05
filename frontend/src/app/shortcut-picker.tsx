import { Plus } from 'lucide-react';

import { FILA_DE_PANEL } from '@/shared/ui/atoms/panel-inferior';

import type { PaginaDeAtajo } from './shortcut-types';

/** La lista de páginas que aún no son una baldosa, para agregar una. */
export function ShortcutPicker({
  disponibles,
  busqueda,
  onAnadir,
}: {
  disponibles: readonly PaginaDeAtajo[];
  busqueda: string;
  onAnadir: (ruta: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {disponibles.map(({ ruta, etiqueta, Icono }) => (
        <li key={ruta}>
          {/* La fila ENTERA es el control: 48 de alto y todo el ancho del
              panel. Por eso el más de la derecha puede ser pequeño. Es la
              misma que usan la hoja de la cuenta y la de buscar, así que la
              clase vive en un solo sitio. */}
          <button type="button" onClick={() => onAnadir(ruta)} className={FILA_DE_PANEL}>
            <Icono className="size-4 shrink-0 opacity-70" aria-hidden={true} />
            <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
            <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </li>
      ))}

      {disponibles.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {busqueda.trim() === ''
            ? 'No queda ninguna página por agregar.'
            : 'No hay ninguna página con ese nombre.'}
        </p>
      )}
    </ul>
  );
}
