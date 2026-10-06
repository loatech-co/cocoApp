import { Archive, CreditCard, Loader2, Plus, Wallet } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';

import {
  useAccounts,
  useArchivarCuenta,
  useCrearCuenta,
} from '@/features/bank-accounts/api/accounts';
import { ApiClientError } from '@/shared/api/api-client';
import { type Account } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Badge } from '@/shared/ui/atoms/badge';
import { Button } from '@/shared/ui/atoms/button';
import { CabeceraDePagina } from '@/shared/ui/atoms/cabecera-de-pagina';
import { Campo } from '@/shared/ui/atoms/campo';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Input } from '@/shared/ui/atoms/input';
import { Saldo } from '@/shared/ui/atoms/monto';
import { Skeleton } from '@/shared/ui/atoms/skeleton';
import { Select } from '@/shared/ui/organisms/select';

const TIPOS: { valor: Account['type']; etiqueta: string }[] = [
  { valor: 'cash', etiqueta: t('accounts.types.cash') },
  { valor: 'debit', etiqueta: t('accounts.types.debit') },
  { valor: 'credit', etiqueta: t('accounts.types.credit') },
  { valor: 'bank', etiqueta: t('accounts.types.bank') },
  { valor: 'savings', etiqueta: t('accounts.types.savings') },
  { valor: 'other', etiqueta: t('accounts.types.other') },
];

const ETIQUETA_DE_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.etiqueta]));

/** M3 — Cuentas. El saldo nunca se escribe: se deriva de los movimientos. */
export function AccountsPage() {
  const cuentas = useAccounts(true);
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  const activas = (cuentas.data ?? []).filter((cuenta) => !cuenta.isArchived);
  const archivadas = (cuentas.data ?? []).filter((cuenta) => cuenta.isArchived);

  return (
    <div className="flex flex-col gap-6">
      <CabeceraDePagina
        titulo={t('shell.sections.accounts')}
        ayuda={t('accounts.help')}
        acciones={
          <Button size="sm" onClick={() => setFormularioAbierto((abierto) => !abierto)}>
            <Plus aria-hidden="true" />
            {t('accounts.new')}
          </Button>
        }
      />

      {formularioAbierto && <FormularioDeCuenta onListo={() => setFormularioAbierto(false)} />}

      {cuentas.isPending && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {cuentas.isError && <ErrorAlert mensaje={t('accounts.loadFailed')} />}

      {cuentas.isSuccess && activas.length === 0 && !formularioAbierto && (
        <NoAccounts onCrear={() => setFormularioAbierto(true)} />
      )}

      {activas.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {activas.map((cuenta) => (
            <TarjetaDeCuenta key={cuenta.id} cuenta={cuenta} />
          ))}
        </div>
      )}

      {archivadas.length > 0 && <ArchivedAccounts cuentas={archivadas} />}
    </div>
  );
}

function TarjetaDeCuenta({ cuenta }: { cuenta: Account }) {
  const archivar = useArchivarCuenta();
  const esTarjeta = cuenta.type === 'credit';
  const Icono = esTarjeta ? CreditCard : Wallet;

  return (
    <Card className={cn(cuenta.isArchived && 'opacity-60')}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icono className="size-4 text-muted-foreground" aria-hidden="true" />
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
            aria-label={cuenta.isArchived ? t('accounts.unarchive') : t('accounts.archive')}
            onClick={() => archivar.mutate({ id: cuenta.id, archivar: !cuenta.isArchived })}
          >
            <Archive aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-4">
          <p className="text-xs text-muted-foreground">
            {esTarjeta ? t('accounts.owed') : t('accounts.available')}
          </p>
          <Saldo amount={cuenta.balance} className="text-2xl" />
        </div>

        {esTarjeta && cuenta.availableCredit !== null && (
          <div className="mt-3">
            <Badge variant={Number.parseFloat(cuenta.availableCredit) < 0 ? 'warning' : 'info'}>
              {t('accounts.creditAvailable', { amount: formatCOP(cuenta.availableCredit) })}
            </Badge>
          </div>
        )}

        {cuenta.balance !== cuenta.balanceProjected && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('accounts.withPending', { amount: formatCOP(cuenta.balanceProjected) })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FormularioDeCuenta({ onListo }: { onListo: () => void }) {
  const form = useAccountForm(onListo);
  const { error, guardando, onSubmit } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('accounts.new')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(evento) => void onSubmit(evento)} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <AccountFields form={form} />

          <div className="flex gap-2">
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('common.save')}
            </Button>
            <Button type="button" variant="ghost" onClick={onListo}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AccountFields({ form }: { form: ReturnType<typeof useAccountForm> }) {
  const { name, setName, type, setType, openingBalance, setOpeningBalance } = form;
  const { creditLimit, setCreditLimit, esTarjeta } = form;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta={t('common.name')} id="name">
        <Input
          id="name"
          required
          value={name}
          onChange={(evento) => setName(evento.target.value)}
          placeholder={t('accounts.namePlaceholder')}
        />
      </Campo>

      <Campo etiqueta={t('accounts.form.type')} id="type">
        <Select
          id="type"
          etiqueta={t('accounts.form.accountType')}
          valor={type}
          opciones={TIPOS.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
          onCambiar={(v) => setType(v as Account['type'])}
        />
      </Campo>

      <Campo
        etiqueta={esTarjeta ? t('accounts.form.currentDebt') : t('accounts.form.openingBalance')}
        id="opening"
      >
        <Input
          id="opening"
          inputMode="decimal"
          value={openingBalance}
          onChange={(evento) => setOpeningBalance(evento.target.value)}
          className="tabular"
        />
      </Campo>

      {esTarjeta && (
        <Campo etiqueta={t('accounts.form.creditLimit')} id="limit">
          <Input
            id="limit"
            inputMode="decimal"
            value={creditLimit}
            onChange={(evento) => setCreditLimit(evento.target.value)}
            className="tabular"
            placeholder="5000000"
          />
        </Campo>
      )}
    </div>
  );
}

/** Los campos de una cuenta nueva y cómo se crea. */
function useAccountForm(onListo: () => void) {
  const crear = useCrearCuenta();

  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('debit');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [creditLimit, setCreditLimit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const esTarjeta = type === 'credit';

  async function onSubmit(evento: SubmitEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    try {
      await crear.mutateAsync({
        name,
        type,
        openingBalance: openingBalance.replace(/[^\d.-]/g, '') || '0',
        ...(esTarjeta && creditLimit ? { creditLimit: creditLimit.replace(/[^\d.]/g, '') } : {}),
      });
      onListo();
    } catch (causa) {
      setError(causa instanceof ApiClientError ? causa.message : t('accounts.createFailed'));
    }
  }

  return {
    name,
    setName,
    type,
    setType,
    openingBalance,
    setOpeningBalance,
    creditLimit,
    setCreditLimit,
    error,
    esTarjeta,
    guardando: crear.isPending,
    onSubmit,
  };
}

function ArchivedAccounts({ cuentas }: { cuentas: Account[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('accounts.archived')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {cuentas.map((cuenta) => (
          <TarjetaDeCuenta key={cuenta.id} cuenta={cuenta} />
        ))}
      </div>
    </section>
  );
}

function NoAccounts({ onCrear }: { onCrear: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <Wallet className="size-8 text-primary" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('accounts.empty')}</p>
        <Button onClick={onCrear}>{t('accounts.create')}</Button>
      </CardContent>
    </Card>
  );
}
