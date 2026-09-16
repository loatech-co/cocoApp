import { ArrowDownUp, ChevronDown, Filter, Plus, Search, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { FiltroClasificacion } from '@/components/filtro-clasificacion';
import { Menu, MenuOpcion, MenuTitulo } from '@/components/menu';
import { SelectorDeRango } from '@/components/selector-de-rango';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Filtros } from '@/lib/filtros';
import { useCategories } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Category, TransactionType } from '@coco/types';

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
  onNuevo,
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
  /**
   * Registrar un movimiento nuevo, del tipo que se elija.
   *
   * Vive aquí y no en un botón flotante porque un botón flotante no dice de
   * QUÉ pantalla es: tapaba una esquina de todas por igual, incluidas
   * aquellas donde registrar un movimiento no significa nada. Al lado del
   * recorte, en cambio, se lee como lo que es: lo que se puede hacer con lo
   * que se está mirando.
   */
  onNuevo?: (tipo: TransactionType) => void;
  acciones?: ReactNode;
}) {
  const categorias = useCategories();

  // La búsqueda se escribe local y se manda con retraso: sin esto cada tecla
  // dispararía una consulta y la lista parpadearía mientras se escribe.
  const [busqueda, setBusqueda] = useState(filtros.q ?? '');

  // El campo empieza plegado y se abre al pulsar la lupa. Se queda abierto
  // mientras haya algo escrito: plegarlo escondería el filtro que está
  // recortando la pantalla, y no habría forma de saber por qué faltan filas.
  const [buscando, setBuscando] = useState((filtros.q ?? '') !== '');
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBusqueda(filtros.q ?? '');
    // Si el filtro llega puesto desde la URL, el campo tiene que estar a la
    // vista: un recorte activo que no se ve no se puede quitar.
    if ((filtros.q ?? '') !== '') setBuscando(true);
  }, [filtros.q]);

  useEffect(() => {
    const id = setTimeout(() => {
      if ((filtros.q ?? '') !== busqueda) aplicar({ q: busqueda });
    }, 300);
    return () => clearTimeout(id);
  }, [busqueda, filtros.q, aplicar]);

  const arbol = categorias.data ?? [];

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
          <Button
            type="button"
            variant="herramienta"
            size="chip-icon"
            aria-label="Buscar"
            title="Buscar"
            onClick={() => {
              setBuscando(true);
              // El foco no se hereda de un elemento que acaba de nacer.
              setTimeout(() => campo.current?.focus(), 0);
            }}
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>
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
          activo={filtros.categoryIds.length > 0}
          ancho="w-72"
          tipo="panel"
        >
          <FiltroClasificacion
            arbol={arbol}
            marcados={filtros.categoryIds}
            onCambiar={(ids) => aplicar({ categoryIds: ids })}
          />
        </Menu>

        <SelectorDeRango filtros={filtros} aplicar={aplicar} />

        {hayFiltrosActivos && (
          <Button
            type="button"
            variant="herramienta"
            size="chip-icon"
            aria-label="Limpiar filtros"
            title="Limpiar filtros"
            onClick={limpiar}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        )}

        {onNuevo && (
          <Menu
            etiqueta="Nuevo movimiento"
            tipo="menu"
            alineado="derecha"
            disparador={({ abierto }) => (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold',
                  'text-primary-foreground transition-colors hover:bg-primary/90',
                )}
              >
                <Plus className="size-4 shrink-0" aria-hidden="true" />
                Nuevo movimiento
                <ChevronDown
                  className={cn('size-3.5 shrink-0 opacity-70 transition-transform', abierto && 'rotate-180')}
                  aria-hidden="true"
                />
              </span>
            )}
          >
            {(cerrar) => (
              <>
                <MenuOpcion
                  Icono={TrendingDown}
                  onClick={() => {
                    cerrar();
                    onNuevo('expense');
                  }}
                >
                  Gasto
                </MenuOpcion>
                {/* Apagada, no escondida: los ingresos existen en el modelo
                    —el resumen ya los suma— y esconder la opción haría creer
                    que la aplicación no sabe registrarlos. */}
                <MenuOpcion Icono={TrendingUp} deshabilitada nota="Pronto" onClick={() => {}}>
                  Ingreso
                </MenuOpcion>
              </>
            )}
          </Menu>
        )}

        {acciones}
      </div>
    </header>
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
