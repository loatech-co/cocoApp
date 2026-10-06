import { ArrowDownUp, Filter, Plus, TrendingDown, TrendingUp } from 'lucide-react';

import type { Filtros } from '@/features/transactions/model/filtros';
import { ORDENES, type Orden } from '@/features/transactions/model/sort-orders';
import { type Category, type TransactionType } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Menu, MenuOpcion, MenuTitulo } from '@/shared/ui/molecules/menu';
import { MenuOpcionDetallada } from '@/shared/ui/molecules/menu-rich-option';

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
      etiqueta={t('transactions.toolbar.sort')}
      Icono={ArrowDownUp}
      soloIcono
      activo={orden.valor !== '-date'}
      ancho="sm"
    >
      {(cerrar) => (
        <>
          <MenuTitulo>{t('transactions.toolbar.sortBy')}</MenuTitulo>
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
      etiqueta={t('transactions.toolbar.filterByClassification')}
      Icono={Filter}
      soloIcono
      activo={filtros.categoryIds.length > 0}
      ancho="lg"
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
      etiqueta={t('transactions.newMovement')}
      tipo="menu"
      alineado="derecha"
      variante="default"
      Icono={Plus}
    >
      {(cerrar) => (
        <div className="flex flex-col">
          <MenuOpcionDetallada
            Icono={TrendingDown}
            color="expense"
            titulo={t('transactions.types.expense')}
            ayuda={t('transactions.toolbar.expenseHelp')}
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
            color="income"
            titulo={t('transactions.types.income')}
            ayuda={t('transactions.toolbar.incomeHelp')}
            nota={t('transactions.kpis.soon')}
            deshabilitada
          />
        </div>
      )}
    </Menu>
  );
}
