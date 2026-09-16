import { ArrowDownUp, Filter, Plus, Search, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { FiltroClasificacion } from '@/components/filtro-clasificacion';
import { Menu, MenuOpcion, MenuTitulo } from '@/components/menu';
import { SelectorDeFecha } from '@/components/selector-de-fecha';
import { Etiqueta } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChipIcono, type ColorDeChip } from '@/components/ui/chip-icono';
import { Input } from '@/components/ui/input';
import type { Filtros } from '@/lib/filtros';
import { useCategories } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { TransactionType } from '@coco/types';
import { CabeceraDePagina } from '@/components/cabecera-de-pagina';

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
    <CabeceraDePagina
      titulo={titulo}
      ayuda={subtitulo ?? resumen}
      alineado="abajo"
      acciones={
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
            size="sm-icon"
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
          // Este panel trae cabecera, lista y pie separados por líneas que
          // cruzan de lado a lado: con el acolchado del menú quedarían
          // cortadas 4px antes de cada borde.
          sinRelleno
        >
          <FiltroClasificacion
            arbol={arbol}
            marcados={filtros.categoryIds}
            onCambiar={(ids) => aplicar({ categoryIds: ids })}
          />
        </Menu>

        <SelectorDeFecha rango atajos filtros={filtros} aplicar={aplicar} />

        {hayFiltrosActivos && (
          <Button
            type="button"
            variant="herramienta"
            size="sm-icon"
            aria-label="Limpiar filtros"
            title="Limpiar filtros"
            onClick={limpiar}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        )}

        {onNuevo && (
          /* Por el mismo camino que los demás menús de esta barra: el alto y
             el radio se los pone `size="sm"` dentro del botón, que es donde
             viven. Escritos aquí, este botón medía distinto que el selector
             de fechas que tiene al lado y la fila se veía descuadrada. */
          <Menu
            etiqueta="Nuevo movimiento"
            tipo="menu"
            alineado="derecha"
            variante="default"
            Icono={Plus}
          >
            {(cerrar) => (
              <div className="flex flex-col">
                <Captura
                  Icono={TrendingDown}
                  color="gasto"
                  titulo="Gasto"
                  ayuda="Plata que sale"
                  onClick={() => {
                    cerrar();
                    onNuevo('expense');
                  }}
                />
                {/* Apagada, no escondida: los ingresos existen en el modelo
                    —el resumen ya los suma— y quitar la opción haría creer que
                    la aplicación no sabe registrarlos. Apagada dice que sabrá. */}
                <Captura
                  Icono={TrendingUp}
                  color="ingreso"
                  titulo="Ingreso"
                  ayuda="Plata que entra"
                  nota="Pronto"
                  deshabilitada
                />
              </div>
            )}
          </Menu>
        )}

        {acciones}
      </div>
      }
    />
  );
}

/**
 * Una de las dos formas de empezar un movimiento.
 *
 * ── Por qué no son dos filas de texto ───────────────────────────────────────
 * Porque esta es la interacción que se repite todos los días, y en ella la
 * primera decisión —gasto o ingreso— no es un ajuste: es de qué se va a
 * hablar. Dos renglones iguales obligan a leer para distinguirlos; con el
 * pastel del color que ya significa eso en el resumen —violeta para lo que
 * sale, verde para lo que entra— la elección se hace mirando, que es lo que
 * uno quiere hacer veinte veces por semana.
 *
 * La segunda línea existe por lo mismo. "Gasto" e "Ingreso" se confunden al
 * leer rápido —empiezan distinto pero se parecen en la forma— y "plata que
 * sale" contra "plata que entra" no se confunden nunca.
 */
function Captura({
  Icono,
  color,
  titulo,
  ayuda,
  nota,
  deshabilitada = false,
  onClick,
}: {
  Icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  color: ColorDeChip;
  titulo: string;
  ayuda: string;
  /** Por qué no se puede todavía, en una palabra. */
  nota?: string;
  deshabilitada?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={deshabilitada}
      aria-disabled={deshabilitada}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors',
        deshabilitada
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <ChipIcono Icono={Icono} color={color} tamano="sm" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{titulo}</span>
        <span className="block truncate text-xs text-muted-foreground">{ayuda}</span>
      </span>

      {/* La misma etiqueta que en el resto de la app. Era un `<span>` con su
          propio redondeo, su propio relleno y un tamaño de letra a mano —11px,
          que no está en la escala—: tres decisiones repetidas para decir lo
          que `Etiqueta` ya dice. */}
      {nota && (
        <Etiqueta tono="neutro" className="shrink-0 text-muted-foreground">
          {nota}
        </Etiqueta>
      )}
    </button>
  );
}
