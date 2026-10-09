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
  /** Las hojas de la navegación, tal cual, en su orden. */
  library: readonly ShortcutPage[];
  /** Lo que hay antes de que nadie toque nada. */
  defaults: readonly string[];
  /** Se ha elegido una baldosa: el anfitrión cierra el panel. */
  onGo: () => void;
}

/**
 * Los atajos.
 *
 * ── Qué es esto y qué no ────────────────────────────────────────────────────
 * Es el único sitio de la barra que no está ya en otra parte: el resto de sus
 * huecos son secciones que también viven en el menú. Esto responde a "qué hago
 * ahora" en vez de a "a dónde puedo ir".
 *
 * La superficie NO TIENE NOMBRE en los textos. Lo que uno tiene son ATAJOS,
 * enseñados como BALDOSAS. "Panel", "hoja" o "deslizable" describen la
 * mecánica y se quedan en los comentarios.
 *
 * ── La biblioteca son las hojas de la navegación ────────────────────────────
 * Las mismas, leídas al dibujar. Una segunda lista de las páginas del producto
 * se separaría de la navegación la primera vez que se añada una pantalla, y la
 * separación no se vería.
 *
 * ── Personalizar es QUÉ páginas y EN QUÉ ORDEN ──────────────────────────────
 * Un solo modo de edición, dos puertas de entrada y una sola salida:
 *
 *   entrar    la pastilla «Editar», o mantener pulsada una baldosa — "quiero
 *             cambiar esto" es una sola intención por muchas formas que tenga
 *             de decirse
 *   dentro    las baldosas tiemblan, se arrastran unas sobre otras, cada una
 *             saca un menos, y aparece un hueco de «Añadir atajo»
 *   salir     la pastilla «Listo», desde cualquiera de las dos pantallas
 *
 * Elegir página es un paso DENTRO del arreglo: el galón vuelve a él y «Listo»
 * sale de la edición entera.
 */
export function useShortcutsSurface({ isOpen, library, defaults, onGo }: ShortcutsOptions): {
  header: ReactNode;
  body: ReactNode;
} {
  const routes = useShortcuts(defaults);
  const [mode, setMode] = useState<Mode>('galeria');
  const [search, setSearch] = useState('');
  const drag = useShortcutDrag(mode);

  // Los tres estados son efímeros, como el almacén: una pantalla que se reabre
  // en mitad de una edición es una pantalla que se reabre mal.
  useOnChange([isOpen], () => {
    if (!isOpen) {
      setMode('galeria');
      setSearch('');
      drag.setDrag(null);
    }
  });

  // Una ruta guardada cuya página ya no existe se cae aquí, al dibujar: quien
  // sabe qué páginas hay es quien pinta, no el almacén.
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
 * Solo lo que NO es ya una baldosa: una fila para una página que ya se tiene
 * solo podría significar "quitar", y quitar es para lo que está el menos.
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
    // La respuesta llega cuando se hace la pregunta: ni un contador
    // permanente ni un control apagado, que no contesta nada al pulsarlo.
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

      {/* La cabeza se pasa del suelo de 78 solo porque su CONTENIDO es más
          alto, que es la única razón por la que debería pasarse. */}
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
