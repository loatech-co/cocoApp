import { DashboardCharts } from '@/features/transactions/components/dashboard-charts';
import { DashboardKpis } from '@/features/transactions/components/dashboard-kpis';
import { DashboardMovements } from '@/features/transactions/components/dashboard-movements';
import { DashboardSkeleton } from '@/features/transactions/components/dashboard-skeleton';
import { ToolbarFilters } from '@/features/transactions/components/toolbar-filters';
import { TransactionModal } from '@/features/transactions/components/transaction-modal';
import { useDashboardPage } from '@/features/transactions/hooks/use-dashboard-page';
import { ApiClientError } from '@/shared/api/api-client';
import { useAuth } from '@/shared/api/auth-context';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/atoms/alert';

/**
 * El nombre con el que saludar.
 *
 * Solo el de pila: "Hola de nuevo, Gerardo Andrés Viteri" no saluda a nadie,
 * recita un documento de identidad. Si no hay nombre, el correo tampoco sirve
 * para saludar, así que el saludo se queda solo.
 */
function firstName(user: { displayName?: string | null } | null | undefined): string {
  return (user?.displayName ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Resumen.
 *
 * Todas las cifras son DERIVADAS: no hay ni una columna de saldo en la base.
 * Si un movimiento cambia, esto cambia solo.
 *
 * La pantalla se lee de arriba abajo como una sola pregunta que se va
 * acotando: qué recorte estoy mirando (toolbar), cuánto suma (indicadores),
 * cómo se comportó en el tiempo (tendencia) y en qué se fue (desglose).
 */
export function DashboardPage() {
  const p = useDashboardPage();
  const { dashboard, table, sheet } = p;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Bar page={p} />

      {dashboard.isError && <SummaryError error={dashboard.error} />}

      {dashboard.isPending && <DashboardSkeleton />}

      {dashboard.data && (
        <>
          <DashboardKpis data={dashboard.data} isUpToDate={p.isUpToDate} />
          <DashboardCharts
            data={dashboard.data}
            hasPending={p.hasPending}
            path={p.path}
            onSelectPayment={(payment) => {
              sheet.setConfirming(payment);
              sheet.setNewType('expense');
              sheet.setEditing(null);
            }}
            onDrillDown={(id) => {
              table.setPage(1);
              p.apply({ categoryIds: [id] });
            }}
            onDrillUp={() => {
              table.setPage(1);
              const previous = p.path[p.path.length - 2];
              p.apply({ categoryIds: previous ? [previous.id] : [] });
            }}
          />
          <DashboardMovements table={table} tree={p.tree} onOpen={sheet.setEditing} />
        </>
      )}

      <TransactionModal
        isOpen={sheet.editing !== undefined}
        transaction={sheet.editing}
        payment={sheet.confirming}
        defaultType={sheet.newType}
        onClose={() => {
          sheet.setEditing(undefined);
          sheet.setConfirming(null);
        }}
      />
    </div>
  );
}

function SummaryError({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{t('transactions.dashboard.loadFailed')}</AlertTitle>
      <AlertDescription>
        {error instanceof ApiClientError
          ? error.message
          : t('transactions.dashboard.loadFailedHelp')}
      </AlertDescription>
    </Alert>
  );
}

/** La barra de filtros con el saludo y lo que suma el recorte. */
function Bar({ page: p }: { page: ReturnType<typeof useDashboardPage> }) {
  const { user } = useAuth();
  const { dashboard, table, sheet } = p;

  return (
    <ToolbarFilters
      title={
        firstName(user)
          ? t('transactions.dashboard.greetingNamed', { name: firstName(user) })
          : t('transactions.dashboard.greeting')
      }
      subtitle={
        dashboard.data
          ? t('transactions.dashboard.rangeSummary', {
              n: dashboard.data.range.count,
              amount: formatCOP(dashboard.data.range.expense),
            })
          : t('transactions.dashboard.help')
      }
      filters={p.filters}
      apply={(c) => {
        table.setPage(1);
        p.apply(c);
      }}
      clear={() => {
        table.setPage(1);
        p.clear();
      }}
      hasActiveFilters={p.hasActiveFilters}
      onNew={(type) => {
        sheet.setNewType(type);
        // Un movimiento nuevo empieza de cero, venga uno de donde venga: sin
        // esto, abrir «Nuevo gasto» después de haber mirado un pendiente
        // habría reabierto la ficha de confirmar aquel pago.
        sheet.setConfirming(null);
        sheet.setEditing(null);
      }}
    />
  );
}
