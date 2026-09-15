import { ArrowDownUp, Filter, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Menu, MenuOpcion, MenuSeparador, MenuTitulo } from '@/components/menu';
import { SelectorDeRango } from '@/components/selector-de-rango';
import { Input } from '@/components/ui/input';
import type { Filtros } from '@/lib/filtros';
import { useCategories } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Category } from '@coco/types';

/** Los órdenes que la API acepta. Lo que no esté aquí, no existe. */
export const ORDENES = [
  { valor: '-date', etiqueta: 'Más recientes' },
  { valor: 'date', etiqueta: 'Más antiguos' },
  { valor: '-amount', etiqueta: 'Mayor valor' },
  { valor: 'amount', etiqueta: 'Menor valor' },
  { valor: 'merchant', etiqueta: 'Concepto A–Z' },
] as const;

export type Orden = (typeof ORDENES)[number]['valor'];

/**
 * La cabecera con los filtros que comparten el Resumen y los Movimientos.
 *
 * ── Por qué el título vive aquí dentro ──────────────────────────────────────
 * Porque el título y el recorte son la misma frase: "Movimientos · 377 de
 * 2022 a 2026". Separarlos en dos bloques deja el qué arriba y el cuánto
 * abajo, y obliga a mirar dos sitios para saber qué se está viendo.
 *
 * ── Por qué los controles son iconos y no una fila de campos ────────────────
 * Porque casi siempre están vacíos. Una fila de selectores siempre visibles
 * ocupa el ancho entero para decir "todos, todos, todos"; plegados detrás de
 * un icono, el espacio se lo queda el contenido, y el icono se enciende cuando
 * hay algo puesto.
 *
 * ── Por qué es el MISMO componente en las dos pantallas ─────────────────────
 * Porque son dos vistas del mismo recorte. Si el resumen filtrara distinto que
 * la lista, las cifras de arriba no explicarían las filas de abajo y habría
 * que desconfiar de ambas.
 */
export function ToolbarFiltros({
  titulo,
  subtitulo,
  resumen,
  filtros,
  aplicar,
  limpiar,
  hayFiltrosActivos,
  orden,
  acciones,
}: {
  titulo: string;
  /** Lo que se está viendo, en una línea. Ej: "377 movimientos". */
  subtitulo?: string;
  /** Alias de `subtitulo`, por compatibilidad con las llamadas existentes. */
  resumen?: string;
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
  limpiar: () => void;
  hayFiltrosActivos: boolean;
  /** Solo donde ordenar significa algo: una lista. */
  orden?: { valor: Orden; onCambiar: (valor: Orden) => void };
  /** Botones propios de la pantalla, a la derecha del todo. */
  acciones?: ReactNode;
}) {
  const categorias = useCategories();

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

  // El campo empieza plegado y se abre al pulsar la lupa. Se queda abierto
  // mientras haya algo escrito: plegarlo escondería el filtro que está
  // recortando la pantalla, y no habría forma de saber por qué faltan filas.
  const [buscando, setBuscando] = useState((filtros.q ?? '') !== '');
  const campo = useRef<HTMLInputElement>(null);

  const arbol = categorias.data ?? [];
  const { centro, grupo, concepto } = rutaSeleccionada(arbol, filtros.categoryId);

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border pb-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{titulo}</h1>
        {(subtitulo ?? resumen) && (
          <p className="mt-1 truncate text-sm text-muted-foreground">{subtitulo ?? resumen}</p>
        )}
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {/* ── Búsqueda ─────────────────────────────────────────────────── */}
        {buscando ? (
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={campo}
              type="search"
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onBlur={() => busqueda === '' && setBuscando(false)}
              placeholder="Buscar: celsia, colegio, sura…"
              aria-label="Buscar por palabra clave"
              className="h-9 rounded-lg pl-9"
            />
          </div>
        ) : (
          <BotonIcono
            etiqueta="Buscar"
            Icono={Search}
            onClick={() => {
              setBuscando(true);
              // El foco no se hereda de un elemento que acaba de nacer.
              setTimeout(() => campo.current?.focus(), 0);
            }}
          />
        )}

        {/* ── Orden ────────────────────────────────────────────────────── */}
        {orden && (
          <Menu
            etiqueta="Ordenar"
            Icono={ArrowDownUp}
            soloIcono
            activo={orden.valor !== '-date'}
            ancho="w-56"
          >
            {(cerrar) => (
              <>
                <MenuTitulo>Ordenar por</MenuTitulo>
                {ORDENES.map((o) => (
                  <MenuOpcion
                    key={o.valor}
                    elegida={orden.valor === o.valor}
                    onClick={() => {
                      orden.onCambiar(o.valor);
                      cerrar();
                    }}
                  >
                    {o.etiqueta}
                  </MenuOpcion>
                ))}
              </>
            )}
          </Menu>
        )}

        {/* ── Clasificación ────────────────────────────────────────────── */}
        <Menu
          etiqueta="Filtrar por clasificación"
          Icono={Filter}
          soloIcono
          activo={filtros.categoryId !== undefined}
          ancho="w-72"
        >
          {(cerrar) => (
            <div className="px-3 pb-2">
              <MenuTitulo>Filtrar por clasificación</MenuTitulo>
              <div className="flex flex-col gap-3 pt-1">
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
                  opciones={centro?.children ?? []}
                  deshabilitado={!centro}
                  onElegir={(id) => aplicar({ categoryId: id ?? centro?.id ?? 0 })}
                />
                <Selector
                  etiqueta="Concepto"
                  ayuda={grupo ? 'Lo más específico' : 'Elige un grupo primero'}
                  valor={concepto?.id}
                  opciones={grupo?.children ?? []}
                  deshabilitado={!grupo}
                  onElegir={(id) => aplicar({ categoryId: id ?? grupo?.id ?? 0 })}
                />
              </div>

              {filtros.categoryId !== undefined && (
                <>
                  <MenuSeparador />
                  <button
                    type="button"
                    onClick={() => {
                      aplicar({ categoryId: 0 });
                      cerrar();
                    }}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Quitar la clasificación
                  </button>
                </>
              )}
            </div>
          )}
        </Menu>

        <SelectorDeRango filtros={filtros} aplicar={aplicar} />

        {hayFiltrosActivos && <BotonIcono etiqueta="Limpiar filtros" Icono={X} onClick={limpiar} />}

        {acciones}
      </div>
    </header>
  );
}

/**
 * Los botones cuadrados del toolbar.
 *
 * Mismo alto y mismo radio que los desplegables de al lado: una fila de
 * controles con dos alturas distintas se lee como dos filas mal alineadas.
 */
function BotonIcono({
  etiqueta,
  Icono,
  onClick,
}: {
  etiqueta: string;
  Icono: typeof Search;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border',
        'bg-card text-foreground transition-colors hover:bg-secondary',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <Icono className="size-4" aria-hidden="true" />
    </button>
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
          'h-9 rounded-lg border bg-card px-3 text-sm',
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
