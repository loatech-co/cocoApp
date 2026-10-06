import type { ReactNode } from 'react';

import { TablaDeMovimientos } from '@/features/transactions/components/tabla-de-movimientos';
import {
  POR_PAGINA,
  type useDashboardPage,
} from '@/features/transactions/hooks/use-dashboard-page';
import { type Category, type Transaction } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { ErrorAlert } from '@/shared/ui/atoms/alert';
import { Pager } from '@/shared/ui/atoms/pager';
import { TablaPie, Td } from '@/shared/ui/molecules/tabla';

type Tabla = ReturnType<typeof useDashboardPage>['tabla'];

/** La tabla del resumen: todo lo que cae en el recorte, paginado. */
export function DashboardMovements({
  tabla,
  arbol,
  onAbrir,
}: {
  tabla: Tabla;
  arbol: Category[];
  onAbrir: (movimiento: Transaction) => void;
}) {
  const { pagina, setPagina, movimientos, ordenDe } = tabla;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Cuenta pagina={pagina} total={movimientos.data?.meta.total} />

      {/* Not an empty table: «no movements» on a failed load reads as if
          they were gone. */}
      {movimientos.isError ? (
        <ErrorAlert message={t('transactions.dashboard.movementsLoadFailed')} />
      ) : (
        <TablaDeMovimientos
          movimientos={movimientos.data?.data ?? []}
          arbol={arbol}
          cargando={movimientos.isPending}
          onAbrir={onAbrir}
          orden={ordenDe}
          filasDelEsqueleto={8}
          pie={pieDeLaTabla(movimientos.data)}
        />
      )}

      <Pager
        page={pagina}
        total={movimientos.data?.meta.total ?? 0}
        perPage={POR_PAGINA}
        onPageChange={setPagina}
      />
    </div>
  );
}

function Cuenta({ pagina, total }: { pagina: number; total: number | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-lg font-semibold">
        {t('transactions.dashboard.movements')}
      </h2>
      {total !== undefined && total > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('transactions.dashboard.range', {
            from: (pagina - 1) * POR_PAGINA + 1,
            to: Math.min(pagina * POR_PAGINA, total),
            total,
          })}
        </p>
      )}
    </div>
  );
}

function pieDeLaTabla(datos: Tabla['movimientos']['data']): ReactNode {
  if (!datos || datos.data.length === 0) return undefined;
  return (
    <TablaPie>
      <tr>
        <Td fija divisor={false}>
          {t('transactions.dashboard.total', { total: datos.meta.total })}
        </Td>
        <Td />
        <Td />
        <Td />
        <Td />
        <Td alineado="derecha" className="tabular font-semibold text-expense">
          {formatCOP(datos.meta.sumExpense)}
        </Td>
      </tr>
    </TablaPie>
  );
}
