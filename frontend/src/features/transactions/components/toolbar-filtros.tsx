import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { Filtros } from '@/features/transactions/model/filtros';
import type { Orden } from '@/features/transactions/model/sort-orders';
import { useCategories } from '@/shared/api/categories';
import { type TransactionType } from '@/shared/api/generated/model';
import { useAlCambiar } from '@/shared/lib/al-cambiar';
import { t } from '@/shared/lib/i18n';
import { useEsMovil } from '@/shared/lib/movil';
import { Button } from '@/shared/ui/atoms/button';
import { CabeceraDePagina } from '@/shared/ui/atoms/cabecera-de-pagina';
import { Input } from '@/shared/ui/atoms/input';
import { PanelInferior } from '@/shared/ui/atoms/panel-inferior';

import { SelectorDeFecha } from './selector-de-fecha';
import { ClassificationMenu, NewMovementMenu, SortMenu } from './toolbar-menus';

interface ToolbarFiltrosProps {
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
}

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
export function ToolbarFiltros(props: ToolbarFiltrosProps) {
  const { titulo, subtitulo, resumen, filtros, aplicar, limpiar, hayFiltrosActivos } = props;
  const { orden, onNuevo, acciones } = props;
  const categorias = useCategories();
  const esMovil = useEsMovil();
  const busqueda = useToolbarSearch(filtros, aplicar);

  return (
    <CabeceraDePagina
      titulo={titulo}
      ayuda={subtitulo ?? resumen}
      alineado="abajo"
      acciones={
        /*
        ── La fila entera, en el teléfono ──────────────────────────────────
        `w-full` y sin envolver: los tres controles que quedan —buscar,
        filtrar y el rango— caben en una línea, y el rango se queda con el
        hueco que sobra porque su etiqueta es un dato y no una palabra fija.

        Envolviendo, un cuarto control tiraba al rango a un segundo renglón él
        solo, alineado a la derecha y con media fila vacía a su izquierda.
      */
        <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-wrap">
          {/* ── Búsqueda ─────────────────────────────────────────────────── */}
          {esMovil ? (
            <PhoneSearch busqueda={busqueda} filtrando={(filtros.q ?? '') !== ''} />
          ) : (
            <DesktopSearch busqueda={busqueda} />
          )}

          {/* ── Orden ────────────────────────────────────────────────────── */}
          {orden && <SortMenu orden={orden} />}

          {/* ── Clasificación ────────────────────────────────────────────── */}
          <ClassificationMenu arbol={categorias.data ?? []} filtros={filtros} aplicar={aplicar} />

          <SelectorDeFecha
            rango
            atajos
            filtros={filtros}
            aplicar={aplicar}
            claseCaja="movil:min-w-0 movil:flex-1"
          />

          {hayFiltrosActivos && <ClearFiltersButton onClick={limpiar} />}

          {/*
          ── Y en el teléfono NO está ────────────────────────────────────────
          Registrar un movimiento vive en el (+) del centro de la barra de
          abajo, que está siempre a la vista y siempre en el mismo sitio, sea
          cual sea la pantalla. Aquí arriba era el mismo botón repetido, y en
          una fila de cuatro controles era el que menos cabía.
        */}
          {onNuevo && !esMovil && <NewMovementMenu onNuevo={onNuevo} />}

          {acciones}
        </div>
      }
    />
  );
}

/** Lo escrito en la búsqueda, si el campo está abierto, y el campo mismo. */
function useToolbarSearch(filtros: Filtros, aplicar: (cambios: Partial<Filtros>) => void) {
  // La búsqueda se escribe local y se manda con retraso: sin esto cada tecla
  // dispararía una consulta y la lista parpadearía mientras se escribe.
  const [texto, setTexto] = useState(filtros.q ?? '');

  // El campo empieza plegado y se abre al pulsar la lupa. Se queda abierto
  // mientras haya algo escrito: plegarlo escondería el filtro que está
  // recortando la pantalla, y no habría forma de saber por qué faltan filas.
  const [buscando, setBuscando] = useState((filtros.q ?? '') !== '');
  const campo = useRef<HTMLInputElement>(null);

  useAlCambiar([filtros.q], () => {
    setTexto(filtros.q ?? '');
    // Si el filtro llega puesto desde la URL, el campo tiene que estar a la
    // vista: un recorte activo que no se ve no se puede quitar.
    if ((filtros.q ?? '') !== '') setBuscando(true);
  });

  useEffect(() => {
    const id = setTimeout(() => {
      if ((filtros.q ?? '') !== texto) aplicar({ q: texto });
    }, 300);
    return () => clearTimeout(id);
  }, [texto, filtros.q, aplicar]);

  return { texto, setTexto, buscando, setBuscando, campo };
}

type ToolbarSearch = ReturnType<typeof useToolbarSearch>;

/*
  En el teléfono el campo no se despliega EN la fila: la levanta una hoja,
  igual que el filtro y el rango. Un campo que aparece en medio de una fila de
  iconos empuja a los otros tres fuera de la pantalla, y el teclado del sistema
  sube justo encima de la lista que se está recortando.
*/
function PhoneSearch({ busqueda, filtrando }: { busqueda: ToolbarSearch; filtrando: boolean }) {
  const { texto, setTexto, buscando, setBuscando, campo } = busqueda;
  return (
    <>
      <Button
        type="button"
        variant="herramienta"
        size="sm-icon"
        aria-label={t('shell.bottomBar.search')}
        aria-pressed={buscando || filtrando}
        aria-expanded={buscando}
        onClick={() => setBuscando(true)}
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>

      <PanelInferior
        abierto={buscando}
        titulo={t('shell.bottomBar.search')}
        cabeza={
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={campo}
              type="search"
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={t('transactions.searchPanel.placeholder')}
              aria-label={t('transactions.toolbar.searchByKeyword')}
              className="pl-9"
            />
          </div>
        }
        onCerrar={() => setBuscando(false)}
      >
        {/* Qué hace esto, y no lo que hace la lupa de la barra de abajo.
          Las dos se ven igual y contestan preguntas distintas: aquella
          BUSCA un movimiento en toda la aplicación; esta RECORTA lo que
          se está mirando, y lo que escriba se queda puesto al cerrar. */}
        <p className="px-3 py-2 text-sm text-muted-foreground">
          {t('transactions.toolbar.searchHelp')}
        </p>
      </PanelInferior>
    </>
  );
}

function DesktopSearch({ busqueda }: { busqueda: ToolbarSearch }) {
  const { texto, setTexto, buscando, setBuscando, campo } = busqueda;

  if (!buscando) {
    return (
      <Button
        type="button"
        variant="herramienta"
        size="sm-icon"
        aria-label={t('shell.bottomBar.search')}
        title={t('shell.bottomBar.search')}
        onClick={() => {
          setBuscando(true);
          // El foco no se hereda de un elemento que acaba de nacer.
          setTimeout(() => campo.current?.focus(), 0);
        }}
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={campo}
        type="search"
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => texto === '' && setBuscando(false)}
        placeholder={t('transactions.searchPanel.placeholder')}
        aria-label={t('transactions.toolbar.searchByKeyword')}
        className="h-9 rounded-lg pl-9"
      />
    </div>
  );
}

function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="herramienta"
      size="sm-icon"
      aria-label={t('transactions.toolbar.clearFilters')}
      title={t('transactions.toolbar.clearFilters')}
      onClick={onClick}
    >
      <X className="size-4" aria-hidden="true" />
    </Button>
  );
}
