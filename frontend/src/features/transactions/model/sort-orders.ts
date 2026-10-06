import { t } from '@/shared/lib/i18n';
/** Los órdenes que la API acepta. Lo que no esté aquí, no existe. */
export const SORT_ORDERS = [
  { value: '-date', label: t('transactions.toolbar.sortOrders.newest') },
  { value: 'date', label: t('transactions.toolbar.sortOrders.oldest') },
  { value: '-amount', label: t('transactions.toolbar.sortOrders.highest') },
  { value: 'amount', label: t('transactions.toolbar.sortOrders.lowest') },
  { value: 'merchant', label: t('transactions.toolbar.sortOrders.conceptAZ') },
] as const;

export type SortOrder = (typeof SORT_ORDERS)[number]['value'];
