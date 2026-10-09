import { ArrowDownUp, Filter, Plus, TrendingDown, TrendingUp } from 'lucide-react';

import type { Filters } from '@/features/transactions/model/filters';
import { SORT_ORDERS, type SortOrder } from '@/features/transactions/model/sort-orders';
import { type Category, type TransactionType } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Menu, MenuOption, MenuTitle } from '@/shared/ui/molecules/menu';
import { MenuRichOption } from '@/shared/ui/molecules/menu-rich-option';

import { ClassificationFilter } from './classification-filter';

/**
 * The filter bar dropdowns: sort, filter by classification
 * and record a new transaction. Search and the range live in
 * `toolbar-filters.tsx`.
 */

export function SortMenu({
  sort,
}: {
  sort: { value: SortOrder; onChange: (value: SortOrder) => void };
}) {
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
          {SORT_ORDERS.map((o) => (
            <MenuOption
              key={o.value}
              isSelected={sort.value === o.value}
              onClick={() => {
                sort.onChange(o.value);
                close();
              }}
            >
              {o.label}
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
  filters: Filters;
  apply: (changes: Partial<Filters>) => void;
}) {
  return (
    <Menu
      label={t('transactions.toolbar.filterByClassification')}
      Icon={Filter}
      isIconOnly
      isActive={filters.categoryIds.length > 0}
      width="lg"
      kind="panel"
      // This panel brings a header, a list and a footer separated by lines that
      // cross from side to side: with the menu's padding they would be
      // cut 4px short of each edge.
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

/* The same way as the other menus in this bar: the height and the radius
   come from `size="sm"` inside the button, which is where they live. Written here,
   this button measured differently from the date selector next to it and the
   row looked misaligned. */
export function NewTransactionMenu({ onNew }: { onNew: (type: TransactionType) => void }) {
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
          {/* Disabled, not hidden: income exists in the model
              —the dashboard already adds it up— and removing the option would suggest
              the app does not know how to record it. Disabled says it will. */}
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
