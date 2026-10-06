import { Flag, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { useActualizarMovimiento } from '@/features/transactions/api/transactions';
import { nombreDelMovimiento, rutaSeleccionada } from '@/features/transactions/model/movimientos';
import { type CategoryTree } from '@/shared/api/categories';
import { type Transaction } from '@/shared/api/generated/model';
import { formatMoney, shortDay, shortMonth } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { EmptyState } from '@/shared/ui/atoms/empty-state';
import { WithTooltip } from '@/shared/ui/atoms/tooltip';
import { Table, TableSkeleton, Td, Th, Tr } from '@/shared/ui/molecules/table';
import { Select } from '@/shared/ui/organisms/select';

/** Las columnas, en un solo sitio: el esqueleto tiene que tener las mismas. */
const COLUMNS = [
  t('transactions.table.columns.concept'),
  t('transactions.table.columns.period'),
  t('transactions.table.columns.paidOn'),
  t('transactions.table.columns.costCenter'),
  t('transactions.table.columns.category'),
  t('transactions.table.columns.amount'),
];

interface ColumnSort {
  direction: 'asc' | 'desc' | null;
  onChange: () => void;
}

/** Cómo pide la tabla el orden de una columna: por qué campo, y en qué sentido empieza. */
type ColumnOrder = (field: string, first: 'asc' | 'desc') => ColumnSort;

/**
 * La tabla de movimientos.
 *
 * ── Por qué es un componente y no dos tablas ────────────────────────────────
 * Porque el resumen y la pantalla de Movimientos enseñan lo MISMO: las mismas
 * columnas, la misma edición en la fila, el mismo modal. Escritas por separado
 * empiezan iguales y se van separando —una aprende a marcar lo que falta por
 * clasificar y la otra no— hasta que la misma plata se ve distinta según por
 * dónde se entre.
 *
 * Lo que cambia entre las dos es el CONTORNO: si hay cabeceras que ordenan, si
 * hay pie de totales y cuántas filas caben. Eso es lo que se pasa.
 */
export function TransactionsTable({
  transactions,
  tree,
  isLoading = false,
  onOpen,
  sort,
  pie,
  emptyLabel,
  skeletonRows = 8,
}: {
  transactions: Transaction[];
  tree: CategoryTree[];
  isLoading?: boolean;
  onOpen: (transaction: Transaction) => void;
  /** Sin esto las cabeceras no ordenan: en un resumen no tendría sentido. */
  sort?: ColumnOrder;
  pie?: ReactNode;
  emptyLabel?: ReactNode;
  skeletonRows?: number;
}) {
  if (isLoading) {
    return <TableSkeleton columns={COLUMNS} rows={skeletonRows} hasDivider={false} />;
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          {emptyLabel ?? (
            <EmptyState
              Icon={SearchX}
              title={t('transactions.table.noMatchTitle')}
              description={t('transactions.table.noMatchHelp')}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <MovementsHead sort={sort} />

      <tbody>
        {transactions.map((m) => (
          <Row key={m.id} transaction={m} tree={tree} onOpen={() => onOpen(m)} />
        ))}
      </tbody>

      {pie}
    </Table>
  );
}

interface RowProps {
  transaction: Transaction;
  tree: CategoryTree[];
  onOpen: () => void;
}

function Row({ transaction, tree, onOpen }: RowProps) {
  const update = useActualizarMovimiento();
  const { centro, categoria } = rutaSeleccionada(tree, transaction.categoryId ?? undefined);

  // Cambiar el selector guarda EXACTAMENTE lo elegido, sin adivinar el resto.
  // La tentación es "conservar el concepto si existe con el mismo nombre en el
  // categoría nuevo", pero eso mueve plata a un sitio que nadie pidió y nadie ve.
  const reclassify = (id: number | undefined): void => {
    update.mutate({ id: transaction.id, cambios: { categoryId: id ?? null } });
  };

  // Sin clasificar no es un error, es algo pendiente: la fila se marca para que
  // se vea de lejos cuál falta por ordenar después de una importación.
  const isUnclassified = transaction.categoryId === null;

  /*
    Un centro ESTÁTICO no se reclasifica desde aquí.

    La estructura de los costos fijos no se improvisa —el alquiler no cambia
    de categoría un martes—, y en una tabla de cien filas con un desplegable en
    cada una, un clic distraído mueve plata de sitio sin que nadie lo note.

    Tampoco desde el modal del movimiento: estático es estático. Si de verdad
    hay que mover algo, se hace dinámico el centro desde Centros de costos —un
    acto deliberado, en otra pantalla— y entonces se mueve.
  */
  const isStatic = centro?.isStatic ?? false;
  const reason = isStatic
    ? t('transactions.table.staticCenter', { name: centro?.name })
    : undefined;

  return (
    <Tr onClick={onOpen} isFlagged={isUnclassified} isDimmed={update.isPending}>
      <NameCell transaction={transaction} tree={tree} isUnclassified={isUnclassified} />

      <PeriodCell transaction={transaction} />

      <Td className="tabular whitespace-nowrap text-muted-foreground">
        {shortDay(transaction.date)}
      </Td>

      {/* Los selectores paran el clic: desplegar una lista no puede abrir
          además el modal que hay detrás. */}
      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <RowSelector
            aria={t('centers.levels.costCenter')}
            value={centro?.id}
            options={tree}
            disabled={isStatic}
            reason={reason}
            onSelect={reclassify}
          />
        </span>
      </Td>

      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <RowSelector
            aria={t('centers.levels.category')}
            value={categoria?.id}
            options={centro?.children ?? []}
            disabled={isStatic || !centro}
            reason={reason}
            onSelect={(id) => reclassify(id ?? centro?.id)}
          />
        </span>
      </Td>

      <AmountCell transaction={transaction} />
    </Tr>
  );
}

const monthOf = (iso: string): string => iso.slice(0, 7);

/**
 * El periodo del movimiento.
 *
 * Con respaldo en la fecha de pago a propósito: durante un despliegue conviven
 * unos segundos la API vieja —que no manda `period`— y el frontend nuevo, y un
 * campo ausente no puede dejar la pantalla en blanco.
 */
// `period` opcional en el tipo de entrada: es lo que dice la nota de arriba.
const period = (
  m: Pick<Transaction, 'date'> & { period?: Transaction['period'] | undefined },
): string => monthOf(m.period ?? m.date);

/** El gasto pertenece a un mes y se pagó en otro. */
const isStale = (m: Transaction): boolean => period(m) !== monthOf(m.date);

function RowSelector({
  aria,
  value,
  options,
  disabled: isDisabled,
  reason,
  onSelect,
}: {
  aria: string;
  value?: number | undefined;
  options: CategoryTree[];
  disabled?: boolean;
  /** Por qué está bloqueado. Un control apagado sin explicación se lee como
      un error de la aplicación. */
  reason?: string | undefined;
  onSelect: (id: number | undefined) => void;
}) {
  const selector = (
    <Select
      size="sm"
      label={aria}
      emptyLabel={`${aria}…`}
      value={value === undefined ? '' : String(value)}
      disabled={isDisabled}
      options={options.map((o) => ({ value: String(o.id), label: o.name }))}
      onChange={(v) => onSelect(v === '' ? undefined : Number(v))}
    />
  );

  if (!isDisabled || reason === undefined) return selector;

  return (
    <WithTooltip text={reason} className="w-full">
      {selector}
    </WithTooltip>
  );
}

function AmountCell({ transaction }: { transaction: Transaction }) {
  return (
    <Td
      align="right"
      className={cn(
        'tabular whitespace-nowrap font-semibold',
        transaction.type === 'income' ? 'text-income' : 'text-expense',
      )}
    >
      {transaction.type === 'income' ? '+' : '−'}
      {formatMoney(transaction.amount, transaction.currency)}
    </Td>
  );
}

function PeriodCell({ transaction }: { transaction: Transaction }) {
  return (
    <Td className="whitespace-nowrap text-muted-foreground">
      {/*
        En ámbar cuando el mes al que PERTENECE el gasto no es aquel en que
        salió la plata: la factura de julio pagada el 4 de agosto. Es el caso
        que descuadra los totales de quien no lo nota —julio parece barato y
        agosto caro— así que se marca, con punto y con explicación.
      */}
      {isStale(transaction) ? (
        <WithTooltip
          text={t('transactions.table.latePayment', {
            month: shortMonth(period(transaction)),
            day: shortDay(transaction.date),
          })}
          className="items-center gap-1.5 font-medium text-warning"
        >
          {/* El punto hace notar la marca: el color solo se pierde en una
              columna de texto gris, y quien no lo nota no sabe que hay algo
              que preguntar. */}
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />
          {shortMonth(period(transaction))}
        </WithTooltip>
      ) : (
        shortMonth(period(transaction))
      )}
    </Td>
  );
}

function NameCell({
  transaction,
  tree,
  isUnclassified,
}: {
  transaction: Transaction;
  tree: CategoryTree[];
  isUnclassified: boolean;
}) {
  return (
    <Td isSticky hasDivider={false} isFlagged={isUnclassified}>
      <span className="flex items-center gap-2">
        {isUnclassified && (
          <Flag
            className="size-3.5 shrink-0 text-warning"
            fill="currentColor"
            aria-label={t('transactions.table.unclassified')}
          />
        )}
        {/* El nombre SALE del concepto: un movimiento es un registro y lo
            toma de donde pertenece. Pintaba `description`, que dejó de
            rellenarse cuando la ficha cambió su campo libre de «Concepto»
            por un selector de conceptos —así que todo lo registrado a mano
            decía «Sin concepto» aunque tuviera su concepto elegido—. */}
        <span className="block max-w-56 truncate font-medium">
          {nombreDelMovimiento(transaction, tree)}
        </span>
      </span>
    </Td>
  );
}

function MovementsHead({ sort }: { sort: ColumnOrder | undefined }) {
  return (
    <thead>
      <tr>
        <Th isSticky hasDivider={false} sort={sort?.('merchant', 'asc')}>
          {t('transactions.table.columns.concept')}
        </Th>
        {/* El periodo antes que el pago: es el eje con el que se mira la app
            —el mes AL QUE PERTENECE el gasto— y la fecha de pago es el dato
            de apoyo que explica por qué a veces no coinciden. */}
        <Th>{t('transactions.table.columns.period')}</Th>
        <Th sort={sort?.('date', 'desc')}>{t('transactions.table.columns.paidOn')}</Th>
        <Th>{t('transactions.table.columns.costCenter')}</Th>
        <Th>{t('transactions.table.columns.category')}</Th>
        <Th align="right" sort={sort?.('amount', 'desc')}>
          {t('transactions.table.columns.amount')}
        </Th>
      </tr>
    </thead>
  );
}
