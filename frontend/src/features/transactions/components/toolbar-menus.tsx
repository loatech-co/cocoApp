import { ArrowDownUp, Filter, Plus, TrendingDown, TrendingUp } from 'lucide-react';

import type { Filtros } from '@/features/transactions/model/filtros';
import { ORDENES, type Orden } from '@/features/transactions/model/sort-orders';
import { type Category, type TransactionType } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Menu, MenuOption, MenuTitle } from '@/shared/ui/molecules/menu';
import { MenuRichOption } from '@/shared/ui/molecules/menu-rich-option';

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
      label={t('transactions.toolbar.sort')}
      Icon={ArrowDownUp}
      isIconOnly
      isActive={orden.valor !== '-date'}
      width="sm"
    >
      {(cerrar) => (
        <>
          <MenuTitle>{t('transactions.toolbar.sortBy')}</MenuTitle>
          {ORDENES.map((o) => (
            <MenuOption
              key={o.valor}
              isSelected={orden.valor === o.valor}
              onClick={() => {
                orden.onCambiar(o.valor);
                cerrar();
              }}
            >
              {o.etiqueta}
            </MenuOption>
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
      label={t('transactions.toolbar.filterByClassification')}
      Icon={Filter}
      isIconOnly
      isActive={filtros.categoryIds.length > 0}
      width="lg"
      kind="panel"
      // Este panel trae cabecera, lista y pie separados por líneas que
      // cruzan de lado a lado: con el acolchado del menú quedarían
      // cortadas 4px antes de cada borde.
      isUnpadded
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
      label={t('transactions.newMovement')}
      kind="menu"
      align="right"
      variant="default"
      Icon={Plus}
    >
      {(cerrar) => (
        <div className="flex flex-col">
          <MenuRichOption
            Icon={TrendingDown}
            color="expense"
            title={t('transactions.types.expense')}
            description={t('transactions.toolbar.expenseHelp')}
            onClick={() => {
              cerrar();
              onNuevo('expense');
            }}
          />
          {/* Apagada, no escondida: los ingresos existen en el modelo
              —el resumen ya los suma— y quitar la opción haría creer que
              la aplicación no sabe registrarlos. Apagada dice que sabrá. */}
          <MenuRichOption
            Icon={TrendingUp}
            color="income"
            title={t('transactions.types.income')}
            description={t('transactions.toolbar.incomeHelp')}
            note={t('transactions.kpis.soon')}
            disabled
          />
        </div>
      )}
    </Menu>
  );
}
