import { DashboardCharts } from '@/features/transactions/components/dashboard-charts';
import { DashboardKpis } from '@/features/transactions/components/dashboard-kpis';
import { DashboardMovements } from '@/features/transactions/components/dashboard-movements';
import { DashboardSkeleton } from '@/features/transactions/components/dashboard-skeleton';
import { MovimientoModal } from '@/features/transactions/components/movimiento-modal';
import { ToolbarFiltros } from '@/features/transactions/components/toolbar-filtros';
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
function nombreDePila(usuario: { displayName?: string | null } | null | undefined): string {
  return (usuario?.displayName ?? '').trim().split(/\s+/)[0] ?? '';
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
  const { dashboard, tabla, ficha } = p;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Barra pagina={p} />

      {dashboard.isError && <ErrorDelResumen error={dashboard.error} />}

      {dashboard.isPending && <DashboardSkeleton />}

      {dashboard.data && (
        <>
          <DashboardKpis datos={dashboard.data} alDia={p.alDia} />
          <DashboardCharts
            datos={dashboard.data}
            hayPendientes={p.hayPendientes}
            ruta={p.ruta}
            onElegirPago={(pago) => {
              ficha.setConfirmando(pago);
              ficha.setTipoNuevo('expense');
              ficha.setEditando(null);
            }}
            onBajar={(id) => {
              tabla.setPagina(1);
              p.aplicar({ categoryIds: [id] });
            }}
            onSubir={() => {
              tabla.setPagina(1);
              const anterior = p.ruta[p.ruta.length - 2];
              p.aplicar({ categoryIds: anterior ? [anterior.id] : [] });
            }}
          />
          <DashboardMovements tabla={tabla} arbol={p.arbol} onAbrir={ficha.setEditando} />
        </>
      )}

      <MovimientoModal
        abierta={ficha.editando !== undefined}
        movimiento={ficha.editando}
        pago={ficha.confirmando}
        tipoPorDefecto={ficha.tipoNuevo}
        onCerrar={() => {
          ficha.setEditando(undefined);
          ficha.setConfirmando(null);
        }}
      />
    </div>
  );
}

function ErrorDelResumen({ error }: { error: Error }) {
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
function Barra({ pagina: p }: { pagina: ReturnType<typeof useDashboardPage> }) {
  const { user } = useAuth();
  const { dashboard, tabla, ficha } = p;

  return (
    <ToolbarFiltros
      titulo={
        nombreDePila(user)
          ? t('transactions.dashboard.greetingNamed', { name: nombreDePila(user) })
          : t('transactions.dashboard.greeting')
      }
      subtitulo={
        dashboard.data
          ? t('transactions.dashboard.rangeSummary', {
              n: dashboard.data.range.count,
              amount: formatCOP(dashboard.data.range.expense),
            })
          : t('transactions.dashboard.help')
      }
      filtros={p.filtros}
      aplicar={(c) => {
        tabla.setPagina(1);
        p.aplicar(c);
      }}
      limpiar={() => {
        tabla.setPagina(1);
        p.limpiar();
      }}
      hayFiltrosActivos={p.hayFiltrosActivos}
      onNuevo={(tipo) => {
        ficha.setTipoNuevo(tipo);
        // Un movimiento nuevo empieza de cero, venga uno de donde venga: sin
        // esto, abrir «Nuevo gasto» después de haber mirado un pendiente
        // habría reabierto la ficha de confirmar aquel pago.
        ficha.setConfirmando(null);
        ficha.setEditando(null);
      }}
    />
  );
}
