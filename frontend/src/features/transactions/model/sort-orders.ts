import { t } from '@/shared/lib/i18n';
/** Los órdenes que la API acepta. Lo que no esté aquí, no existe. */
export const ORDENES = [
  { valor: '-date', etiqueta: t('transactions.toolbar.sortOrders.newest') },
  { valor: 'date', etiqueta: t('transactions.toolbar.sortOrders.oldest') },
  { valor: '-amount', etiqueta: t('transactions.toolbar.sortOrders.highest') },
  { valor: 'amount', etiqueta: t('transactions.toolbar.sortOrders.lowest') },
  { valor: 'merchant', etiqueta: t('transactions.toolbar.sortOrders.conceptAZ') },
] as const;

export type Orden = (typeof ORDENES)[number]['valor'];
