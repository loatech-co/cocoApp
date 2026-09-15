import { ArrowDownUp, ChevronRight, Filter, Search, X } from 'lucide-react';
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
  const { lista, miga } = ramaVisible(arbol, rutaSeleccionada(arbol, filtros.categoryId));

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
            <>
              <MenuTitulo>Clasificación</MenuTitulo>

              {/* La miga de pan es el camino de vuelta. Sin ella, bajar a los
                  conceptos de un grupo sería un viaje de ida. */}
              <div className="flex flex-wrap items-center gap-1 px-3 pb-1.5 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => aplicar({ categoryId: 0 })}
                  className="rounded hover:text-foreground hover:underline"
                >
                  Todo
                </button>
                {miga.map((nodo) => (
                  <span key={nodo.id} className="flex items-center gap-1">
                    <ChevronRight className="size-3 opacity-60" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => aplicar({ categoryId: nodo.id })}
                      className="max-w-32 truncate rounded hover:text-foreground hover:underline"
                    >
                      {nodo.name}
                    </button>
                  </span>
                ))}
              </div>

              {/* Se limita el alto: un centro con cuarenta conceptos haría un
                  menú más largo que la pantalla y sin forma de llegar al pie. */}
              <div className="max-h-72 overflow-y-auto">
                {lista.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Nada que desglosar aquí.</p>
                ) : (
                  lista.map((nodo) => (
                    <MenuOpcion
                      key={nodo.id}
                      elegida={filtros.categoryId === nodo.id}
                      onClick={() => {
                        aplicar({ categoryId: nodo.id });
                        // Si no tiene nada dentro, el menú ya cumplió: seguir
                        // abierto sobre una lista vacía no ofrece nada.
                        if (!nodo.children?.length) cerrar();
                      }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{nodo.name}</span>
                        {!!nodo.children?.length && (
                          <ChevronRight
                            className="size-3.5 shrink-0 opacity-40"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </MenuOpcion>
                  ))
                )}
              </div>

              {filtros.categoryId !== undefined && (
                <>
                  <MenuSeparador />
                  <MenuOpcion
                    Icono={X}
                    onClick={() => {
                      aplicar({ categoryId: 0 });
                      cerrar();
                    }}
                  >
                    Quitar el filtro
                  </MenuOpcion>
                </>
              )}
            </>
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

/**
 * Qué nivel se muestra en el panel, y el camino hasta él.
 *
 * ── Por qué no hay estado de navegación ─────────────────────────────────────
 * Porque seleccionar ES navegar: elegir un centro de costos filtra por su rama
 * entera y, de paso, deja a la vista sus grupos para afinar. Un estado aparte
 * de "dónde estoy mirando" podría contradecir a "qué tengo filtrado", y habría
 * que mantener los dos de acuerdo en cada clic.
 *
 * Manda el nodo más profundo que TENGA hijos. Si el elegido no tiene nada
 * dentro —un concepto, o un grupo todavía vacío—, se muestran sus hermanos: la
 * alternativa es un panel en blanco justo después de hacer clic.
 */
export function ramaVisible(
  arbol: Category[],
  ruta: { centro?: Category; grupo?: Category; concepto?: Category },
): { lista: Category[]; miga: Category[] } {
  const cadena = [ruta.centro, ruta.grupo, ruta.concepto].filter(
    (n): n is Category => n !== undefined,
  );

  for (let i = cadena.length - 1; i >= 0; i -= 1) {
    const hijos = cadena[i].children ?? [];
    if (hijos.length > 0) return { lista: hijos, miga: cadena.slice(0, i + 1) };
  }

  return { lista: arbol, miga: [] };
}
