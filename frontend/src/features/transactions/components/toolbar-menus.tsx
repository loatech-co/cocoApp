import { ArrowDownUp, Filter, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import type { ComponentType } from 'react';

import type { Filtros } from '@/features/transactions/model/filtros';
import { ORDENES, type Orden } from '@/features/transactions/model/sort-orders';
import { cn } from '@/shared/lib/utils';
import { Etiqueta } from '@/shared/ui/atoms/badge';
import { ChipIcono, type ColorDeChip } from '@/shared/ui/atoms/chip-icono';
import { REALCE } from '@/shared/ui/foundations/superficie';
import { Menu, MenuOpcion, MenuTitulo } from '@/shared/ui/molecules/menu';
import type { Category, TransactionType } from '@coco/types';

import { FiltroClasificacion } from './filtro-clasificacion';

/**
 * Los desplegables de la barra de filtros: ordenar, filtrar por clasificación
 * y registrar un movimiento nuevo. La búsqueda y el rango viven en
 * `toolbar-filtros.tsx`.
 */

export function SortMenu({
  orden,
}: {
  orden: { valor: Orden; onCambiar: (valor: Orden) => void };
}) {
  return (
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
  );
}

export function ClassificationMenu({
  arbol,
  filtros,
  aplicar,
}: {
  arbol: Category[];
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
}) {
  return (
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
  );
}

/* Por el mismo camino que los demás menús de esta barra: el alto y el radio se
   los pone `size="sm"` dentro del botón, que es donde viven. Escritos aquí,
   este botón medía distinto que el selector de fechas que tiene al lado y la
   fila se veía descuadrada. */
export function NewMovementMenu({ onNuevo }: { onNuevo: (tipo: TransactionType) => void }) {
  return (
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
            ayuda="Dinero que sale"
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
            ayuda="Dinero que entra"
            nota="Pronto"
            deshabilitada
          />
        </div>
      )}
    </Menu>
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
        deshabilitada ? 'cursor-not-allowed opacity-50' : REALCE,
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
