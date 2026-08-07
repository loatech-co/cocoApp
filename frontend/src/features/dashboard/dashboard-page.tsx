import { AlertCircle, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Monto, Saldo } from '@/components/monto';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { useDashboard } from '@/lib/queries';
import { formatCOP } from '@/lib/utils';

/**
 * M5 — Dashboard.
 *
 * Todas las cifras son DERIVADAS: no hay ni una columna de saldo en la base.
 * Si un movimiento cambia, esto cambia solo.
 */
export function DashboardPage() {
  const dashboard = useDashboard();

  if (dashboard.isPending) return <Esqueleto />;

  if (dashboard.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>No se pudo cargar el resumen</AlertTitle>
        <AlertDescription>
          {dashboard.error instanceof ApiClientError
            ? dashboard.error.message
            : 'Revisa que la API esté corriendo.'}
        </AlertDescription>
      </Alert>
    );
  }

  const { totals, month, by_category, accounts } = dashboard.data;
  const sinDatos = accounts.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Tu resumen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cómo vas este mes. Todo se calcula de tus movimientos.
        </p>
      </header>

      {sinDatos ? (
        <EstadoVacio />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi
              etiqueta="Patrimonio neto"
              valor={<Saldo amount={totals.net_worth} className="text-2xl" />}
              detalle={`${formatCOP(totals.assets)} en cuentas · ${formatCOP(totals.debts)} en deuda`}
              Icono={Wallet}
            />
            <Kpi
              etiqueta="Ingresos del mes"
              valor={<Monto amount={month.income} type="income" className="text-2xl" soloTexto />}
              Icono={TrendingUp}
            />
            <Kpi
              etiqueta="Gastos del mes"
              valor={<Monto amount={month.expense} type="expense" className="text-2xl" soloTexto />}
              Icono={TrendingDown}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Flujo del mes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Ingresos menos gastos. Las transferencias entre tus cuentas no cuentan: solo
                cambian de bolsillo.
              </p>
              <p className="mt-3">
                <Saldo amount={month.net} className="text-3xl" />
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <GastoPorCategoria filas={by_category} totalGastado={month.expense} />
            <Cuentas cuentas={accounts} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  detalle,
  Icono,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: string;
  Icono: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Icono className="size-4" aria-hidden />
          <span className="text-sm">{etiqueta}</span>
        </div>
        <div>{valor}</div>
        {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  );
}

function GastoPorCategoria({
  filas,
  totalGastado,
}: {
  filas: { category_id: number | null; name: string; color: string | null; total: string }[];
  totalGastado: string;
}) {
  const total = Number.parseFloat(totalGastado) || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>En qué se fue</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {filas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay gastos este mes.
          </p>
        )}

        {/* Ordenadas de mayor a menor: lo que más pesa se lee primero. */}
        {filas.slice(0, 8).map((fila) => {
          const porcentaje = (Number.parseFloat(fila.total) / total) * 100;

          return (
            <div key={fila.category_id ?? 'sin'} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={fila.category_id === null ? 'text-muted-foreground' : ''}>
                  {fila.name}
                </span>
                <span className="tabular text-muted-foreground">
                  {formatCOP(fila.total)}
                  <span className="ml-2 text-xs">{porcentaje.toFixed(0)}%</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, porcentaje)}%`,
                    backgroundColor: fila.color ?? 'var(--color-ash-400)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Cuentas({
  cuentas,
}: {
  cuentas: { id: number; name: string; type: string; balance: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tus cuentas</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {cuentas.map((cuenta) => (
          <div
            key={cuenta.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium">{cuenta.name}</p>
              <p className="text-xs text-muted-foreground">
                {cuenta.type === 'credit' ? 'Debes' : 'Disponible'}
              </p>
            </div>
            <Saldo amount={cuenta.balance} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EstadoVacio() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <Sparkles className="size-8 text-primary" aria-hidden="true" />
        <div>
          <h2 className="font-serif text-xl font-semibold">Empecemos por tus cuentas</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Registra dónde tienes tu plata —efectivo, débito, tarjetas— y a partir de ahí todo lo
            demás se calcula solo.
          </p>
        </div>
        <Button asChild>
          <Link to="/cuentas">Crear mi primera cuenta</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-48" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-32" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
