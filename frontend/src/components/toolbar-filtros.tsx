import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PRESETS, type Filtros } from '@/lib/filtros';
import { useCategories } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Category } from '@coco/types';

/**
 * La barra de filtros que comparten el Resumen y los Movimientos.
 *
 * ── Por qué es el MISMO componente en las dos pantallas ─────────────────────
 * Porque son dos vistas del mismo recorte. Si el resumen filtrara distinto que
 * la lista, las cifras de arriba no explicarían las filas de abajo y habría que
 * desconfiar de ambas.
 *
 * ── En móvil ────────────────────────────────────────────────────────────────
 * La búsqueda y el rango quedan siempre a la vista, porque son lo que se usa a
 * diario. El resto se pliega detrás de un botón: cinco selectores apilados
 * empujarían el contenido fuera de la pantalla en un teléfono.
 */
export function ToolbarFiltros({
  filtros,
  aplicar,
  limpiar,
  hayFiltrosActivos,
  resumen,
}: {
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
  limpiar: () => void;
  hayFiltrosActivos: boolean;
  /** Texto corto con lo que se está viendo. Ej: "377 movimientos". */
  resumen?: string;
}) {
  const categorias = useCategories();
  const [abierto, setAbierto] = useState(false);

  // La búsqueda se escribe local y se manda con retraso: sin esto cada tecla
  // dispararía una consulta y la lista parpadearía mientras se escribe.
  const [busqueda, setBusqueda] = useState(filtros.q ?? '');
  useEffect(() => setBusqueda(filtros.q ?? ''), [filtros.q]);
  useEffect(() => {
    const id = setTimeout(() => {
      if ((filtros.q ?? '') !== busqueda) aplicar({ q: busqueda });
    }, 300);
    return () => clearTimeout(id);
  }, [busqueda, filtros.q, aplicar]);

  const arbol = categorias.data ?? [];
  const { centro, grupo, concepto } = rutaSeleccionada(arbol, filtros.categoryId);

  const grupos = centro?.children ?? [];
  const conceptos = grupo?.children ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-[0_1px_2px_rgba(65,60,47,0.04),0_8px_24px_-12px_rgba(65,60,47,0.16)] sm:p-4">
      {/* Fila 1 — siempre visible */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar: celsia, colegio, sura…"
            aria-label="Buscar por palabra clave"
            className="pl-9"
          />
        </div>

        <Button
          type="button"
          variant={abierto ? 'default' : 'outline'}
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="shrink-0"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filtros
          {hayFiltrosActivos && (
            <span className="ml-1 size-2 rounded-full bg-primary-foreground" aria-hidden="true" />
          )}
        </Button>

        {hayFiltrosActivos && (
          <Button type="button" variant="ghost" onClick={limpiar} className="shrink-0">
            <X className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Limpiar</span>
          </Button>
        )}
      </div>

      {/* Fila 2 — rango de tiempo, siempre visible: es el filtro que más se toca */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {PRESETS.map(({ valor, etiqueta, ayuda }) => (
          <button
            key={valor}
            type="button"
            title={ayuda}
            onClick={() => aplicar({ preset: valor })}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filtros.preset === valor
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent',
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {/* Fila 3 — plegable */}
      {abierto && (
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <Selector
            etiqueta="Centro de costos"
            ayuda="Lo más general"
            valor={centro?.id}
            opciones={arbol}
            onElegir={(id) => aplicar({ categoryId: id ?? 0 })}
          />
          <Selector
            etiqueta="Grupo"
            ayuda={centro ? 'Dentro del centro' : 'Elige un centro primero'}
            valor={grupo?.id}
            opciones={grupos}
            deshabilitado={!centro}
            onElegir={(id) => aplicar({ categoryId: id ?? centro?.id ?? 0 })}
          />
          <Selector
            etiqueta="Concepto"
            ayuda={grupo ? 'Lo más específico' : 'Elige un grupo primero'}
            valor={concepto?.id}
            opciones={conceptos}
            deshabilitado={!grupo}
            onElegir={(id) => aplicar({ categoryId: id ?? grupo?.id ?? 0 })}
          />

          {filtros.preset === 'personalizado' && (
            <>
              <Campo etiqueta="Desde">
                <Input
                  type="date"
                  value={filtros.from}
                  max={filtros.to}
                  onChange={(e) => aplicar({ from: e.target.value })}
                />
              </Campo>
              <Campo etiqueta="Hasta">
                <Input
                  type="date"
                  value={filtros.to}
                  min={filtros.from}
                  onChange={(e) => aplicar({ to: e.target.value })}
                />
              </Campo>
            </>
          )}
        </div>
      )}

      {/* Lo que se está viendo, en palabras */}
      <p className="text-xs text-muted-foreground">
        {filtros.from} a {filtros.to}
        {resumen ? ` · ${resumen}` : ''}
      </p>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
      {children}
    </label>
  );
}

function Selector({
  etiqueta,
  ayuda,
  valor,
  opciones,
  deshabilitado,
  onElegir,
}: {
  etiqueta: string;
  ayuda: string;
  valor?: number;
  opciones: Category[];
  deshabilitado?: boolean;
  onElegir: (id: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {etiqueta} <span className="font-normal opacity-70">· {ayuda}</span>
      </span>
      <select
        value={valor ?? ''}
        disabled={deshabilitado || opciones.length === 0}
        onChange={(e) => onElegir(e.target.value === '' ? null : Number(e.target.value))}
        className={cn(
          'h-10 rounded-lg border bg-card px-3 text-sm',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        style={{ borderColor: 'var(--input)' }}
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Reconstruye la ruta completa a partir de un solo id.
 *
 * Los filtros guardan UN id —el más específico que se eligió—, no los tres.
 * Guardar los tres obligaría a mantenerlos coherentes entre sí en cada cambio,
 * y bastaría un descuido para tener un grupo que no pertenece al centro
 * seleccionado. Con uno solo, el resto se deduce y no puede contradecirse.
 */
export function rutaSeleccionada(
  arbol: Category[],
  categoryId?: number,
): { centro?: Category; grupo?: Category; concepto?: Category } {
  if (categoryId === undefined) return {};

  for (const centro of arbol) {
    if (centro.id === categoryId) return { centro };

    for (const grupo of centro.children ?? []) {
      if (grupo.id === categoryId) return { centro, grupo };

      for (const concepto of grupo.children ?? []) {
        if (concepto.id === categoryId) return { centro, grupo, concepto };
      }
    }
  }

  return {};
}
