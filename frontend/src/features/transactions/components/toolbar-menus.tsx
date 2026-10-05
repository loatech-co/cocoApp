import { ArrowDownUp, Filter, Plus, TrendingDown, TrendingUp } from 'lucide-react';

import type { Filtros } from '@/features/transactions/model/filtros';
import { ORDENES, type Orden } from '@/features/transactions/model/sort-orders';
import { Menu, MenuOpcion, MenuTitulo } from '@/shared/ui/molecules/menu';
import { MenuOpcionDetallada } from '@/shared/ui/molecules/menu-rich-option';
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
          <MenuOpcionDetallada
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
          <MenuOpcionDetallada
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
