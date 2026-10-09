import { t } from '@/shared/lib/i18n';
/** The sort orders the API accepts. What is not here does not exist. */
export const SORT_ORDERS = [
  { value: '-date', label: t('transactions.toolbar.sortOrders.newest') },
  { value: 'date', label: t('transactions.toolbar.sortOrders.oldest') },
  { value: '-amount', label: t('transactions.toolbar.sortOrders.highest') },
  { value: 'amount', label: t('transactions.toolbar.sortOrders.lowest') },
  { value: 'merchant', label: t('transactions.toolbar.sortOrders.conceptAZ') },
] as const;

export type SortOrder = (typeof SORT_ORDERS)[number]['value'];
