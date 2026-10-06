import { ArrowDownUp, Filter, Plus, TrendingDown, TrendingUp } from 'lucide-react';

import type { Filtros } from '@/features/transactions/model/filters';
import { ORDENES, type Orden } from '@/features/transactions/model/sort-orders';
import { type Category, type TransactionType } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Menu, MenuOption, MenuTitle } from '@/shared/ui/molecules/menu';
import { MenuRichOption } from '@/shared/ui/molecules/menu-rich-option';

import { ClassificationFilter } from './classification-filter';

/**
 * Los desplegables de la barra de filtros: ordenar, filtrar por clasificación
 * y registrar un movimiento nuevo. La búsqueda y el rango viven en
 * `toolbar-filters.tsx`.
 */

export function SortMenu({ sort }: { sort: { value: Orden; onChange: (value: Orden) => void } }) {
  return (
    <Menu
      label={t('transactions.toolbar.sort')}
      Icon={ArrowDownUp}
      isIconOnly
      isActive={sort.value !== '-date'}
      width="sm"
    >
      {(close) => (
        <>
          <MenuTitle>{t('transactions.toolbar.sortBy')}</MenuTitle>
          {ORDENES.map((o) => (
            <MenuOption
              key={o.valor}
              isSelected={sort.value === o.valor}
              onClick={() => {
                sort.onChange(o.valor);
                close();
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
  tree,
  filters,
  apply,
}: {
  tree: Category[];
  filters: Filtros;
  apply: (changes: Partial<Filtros>) => void;
}) {
  return (
    <Menu
      label={t('transactions.toolbar.filterByClassification')}
      Icon={Filter}
      isIconOnly
      isActive={filters.categoryIds.length > 0}
      width="lg"
      kind="panel"
      // Este panel trae cabecera, lista y pie separados por líneas que
      // cruzan de lado a lado: con el acolchado del menú quedarían
      // cortadas 4px antes de cada borde.
      isUnpadded
    >
      <ClassificationFilter
        tree={tree}
        checked={filters.categoryIds}
        onChange={(ids) => apply({ categoryIds: ids })}
      />
    </Menu>
  );
}

/* Por el mismo camino que los demás menús de esta barra: el alto y el radio se
   los pone `size="sm"` dentro del botón, que es donde viven. Escritos aquí,
   este botón medía distinto que el selector de fechas que tiene al lado y la
   fila se veía descuadrada. */
export function NewMovementMenu({ onNew }: { onNew: (type: TransactionType) => void }) {
  return (
    <Menu
      label={t('transactions.newMovement')}
      kind="menu"
      align="right"
      variant="default"
      Icon={Plus}
    >
      {(close) => (
        <div className="flex flex-col">
          <MenuRichOption
            Icon={TrendingDown}
            color="expense"
            title={t('transactions.types.expense')}
            description={t('transactions.toolbar.expenseHelp')}
            onClick={() => {
              close();
              onNew('expense');
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
