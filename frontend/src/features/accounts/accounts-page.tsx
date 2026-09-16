import type { Account } from '@coco/types';
import { AlertCircle, Archive, CreditCard, Loader2, Plus, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Saldo } from '@/components/monto';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { ApiClientError } from '@/lib/api-client';
import { useAccounts, useArchivarCuenta, useCrearCuenta } from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';

const TIPOS: { valor: Account['type']; etiqueta: string }[] = [
  { valor: 'cash', etiqueta: 'Efectivo' },
  { valor: 'debit', etiqueta: 'Débito' },
  { valor: 'credit', etiqueta: 'Tarjeta de crédito' },
  { valor: 'bank', etiqueta: 'Cuenta bancaria' },
  { valor: 'savings', etiqueta: 'Ahorros' },
  { valor: 'other', etiqueta: 'Otra' },
];

const ETIQUETA_DE_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.etiqueta]));

/** M3 — Cuentas. El saldo nunca se escribe: se deriva de los movimientos. */
export function AccountsPage() {
  const cuentas = useAccounts(true);
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  const activas = (cuentas.data ?? []).filter((cuenta) => !cuenta.is_archived);
  const archivadas = (cuentas.data ?? []).filter((cuenta) => cuenta.is_archived);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Cuentas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dónde tienes tu plata. El saldo se calcula de tus movimientos.
          </p>
        </div>
        <Button onClick={() => setFormularioAbierto((abierto) => !abierto)}>
          <Plus aria-hidden="true" />
          Nueva cuenta
        </Button>
      </header>

      {formularioAbierto && <FormularioDeCuenta onListo={() => setFormularioAbierto(false)} />}

      {cuentas.isPending && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {cuentas.isSuccess && activas.length === 0 && !formularioAbierto && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Wallet className="size-8 text-primary" aria-hidden="true" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Aún no tienes cuentas. Crea la primera —efectivo, tu débito o una tarjeta— para
              empezar a registrar movimientos.
            </p>
            <Button onClick={() => setFormularioAbierto(true)}>Crear cuenta</Button>
          </CardContent>
        </Card>
      )}

      {activas.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {activas.map((cuenta) => (
            <TarjetaDeCuenta key={cuenta.id} cuenta={cuenta} />
          ))}
        </div>
      )}

      {archivadas.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Archivadas</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {archivadas.map((cuenta) => (
              <TarjetaDeCuenta key={cuenta.id} cuenta={cuenta} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TarjetaDeCuenta({ cuenta }: { cuenta: Account }) {
  const archivar = useArchivarCuenta();
  const esTarjeta = cuenta.type === 'credit';

  return (
    <Card className={cn(cuenta.is_archived && 'opacity-60')}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {esTarjeta ? (
                <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <p className="truncate font-medium">{cuenta.name}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ETIQUETA_DE_TIPO[cuenta.type]}
              {cuenta.last4 && ` ····${cuenta.last4}`}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-label={cuenta.is_archived ? 'Desarchivar' : 'Archivar'}
            onClick={() =>
              archivar.mutate({ id: cuenta.id, archivar: !cuenta.is_archived })
            }
          >
            <Archive aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-4">
          <p className="text-xs text-muted-foreground">{esTarjeta ? 'Debes' : 'Disponible'}</p>
          <Saldo amount={cuenta.balance} className="text-2xl" />
        </div>

        {esTarjeta && cuenta.available_credit !== null && (
          <div className="mt-3">
            <Badge variant={Number.parseFloat(cuenta.available_credit) < 0 ? 'warning' : 'info'}>
              Cupo disponible: {formatCOP(cuenta.available_credit)}
            </Badge>
          </div>
        )}

        {cuenta.balance !== cuenta.balance_projected && (
          <p className="mt-2 text-xs text-muted-foreground">
            Con movimientos pendientes: {formatCOP(cuenta.balance_projected)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FormularioDeCuenta({ onListo }: { onListo: () => void }) {
  const crear = useCrearCuenta();

  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('debit');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [creditLimit, setCreditLimit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const esTarjeta = type === 'credit';

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    try {
      await crear.mutateAsync({
        name,
        type,
        opening_balance: openingBalance.replace(/[^\d.-]/g, '') || '0',
        ...(esTarjeta && creditLimit ? { credit_limit: creditLimit.replace(/[^\d.]/g, '') } : {}),
      });
      onListo();
    } catch (causa) {
      setError(causa instanceof ApiClientError ? causa.message : 'No se pudo crear la cuenta.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva cuenta</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(evento) => void onSubmit(evento)} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(evento) => setName(evento.target.value)}
                placeholder="Bancolombia débito"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="type">Tipo</Label>
              <Select
                id="type"
                etiqueta="Tipo de cuenta"
                valor={type}
                opciones={TIPOS.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
                onCambiar={(v) => setType(v as Account['type'])}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="opening">
                {esTarjeta ? 'Deuda actual' : 'Saldo inicial'}
              </Label>
              <Input
                id="opening"
                inputMode="decimal"
                value={openingBalance}
                onChange={(evento) => setOpeningBalance(evento.target.value)}
                className="tabular"
              />
            </div>

            {esTarjeta && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="limit">Cupo total</Label>
                <Input
                  id="limit"
                  inputMode="decimal"
                  value={creditLimit}
                  onChange={(evento) => setCreditLimit(evento.target.value)}
                  className="tabular"
                  placeholder="5000000"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
            <Button type="button" variant="ghost" onClick={onListo}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
