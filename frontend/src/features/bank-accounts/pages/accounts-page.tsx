import { Archive, CreditCard, Loader2, Plus, Wallet } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';

import {
  useAccounts,
  useArchiveAccount,
  useCreateAccount,
} from '@/features/bank-accounts/api/accounts';
import { ApiClientError } from '@/shared/api/api-client';
import { type Account } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Balance } from '@/shared/ui/atoms/amount';
import { Badge } from '@/shared/ui/atoms/badge';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { PageHeader } from '@/shared/ui/atoms/page-header';
import { Skeleton } from '@/shared/ui/atoms/skeleton';
import { Select } from '@/shared/ui/organisms/select';

const TYPES: { value: Account['type']; label: string }[] = [
  { value: 'cash', label: t('accounts.types.cash') },
  { value: 'debit', label: t('accounts.types.debit') },
  { value: 'credit', label: t('accounts.types.credit') },
  { value: 'bank', label: t('accounts.types.bank') },
  { value: 'savings', label: t('accounts.types.savings') },
  { value: 'other', label: t('accounts.types.other') },
];

const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

/** M3 — Accounts. The balance is never written: it derives from the transactions. */
export function AccountsPage() {
  const accounts = useAccounts(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const active = (accounts.data ?? []).filter((account) => !account.isArchived);
  const archived = (accounts.data ?? []).filter((account) => account.isArchived);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('shell.sections.accounts')}
        description={t('accounts.help')}
        actions={
          <Button size="sm" onClick={() => setIsFormOpen((isOpen) => !isOpen)}>
            <Plus aria-hidden="true" />
            {t('accounts.new')}
          </Button>
        }
      />

      {isFormOpen && <AccountForm onDone={() => setIsFormOpen(false)} />}

      {accounts.isPending && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {accounts.isError && <ErrorAlert message={t('accounts.loadFailed')} />}

      {accounts.isSuccess && active.length === 0 && !isFormOpen && (
        <NoAccounts onCreate={() => setIsFormOpen(true)} />
      )}

      {active.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}

      {archived.length > 0 && <ArchivedAccounts accounts={archived} />}
    </div>
  );
}

function AccountCard({ account }: { account: Account }) {
  const isArchived = useArchiveAccount();
  const isCard = account.type === 'credit';
  const Icon = isCard ? CreditCard : Wallet;

  return (
    <Card className={cn(account.isArchived && 'opacity-60')}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              <p className="truncate font-medium">{account.name}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {TYPE_LABEL[account.type]}
              {account.last4 && ` ····${account.last4}`}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-label={account.isArchived ? t('accounts.unarchive') : t('accounts.archive')}
            onClick={() => isArchived.mutate({ id: account.id, isArchived: !account.isArchived })}
          >
            <Archive aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-4">
          <p className="text-xs text-muted-foreground">
            {isCard ? t('accounts.owed') : t('accounts.available')}
          </p>
          <Balance amount={account.balance} className="text-2xl" />
        </div>

        {isCard && account.availableCredit !== null && (
          <div className="mt-3">
            <Badge variant={Number.parseFloat(account.availableCredit) < 0 ? 'warning' : 'info'}>
              {t('accounts.creditAvailable', { amount: formatCOP(account.availableCredit) })}
            </Badge>
          </div>
        )}

        {account.balance !== account.balanceProjected && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('accounts.withPending', { amount: formatCOP(account.balanceProjected) })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const form = useAccountForm(onDone);
  const { error, isSaving, onSubmit } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('accounts.new')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <AccountFields form={form} />

          <div className="flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('common.save')}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
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
  const { creditLimit, setCreditLimit, isCard } = form;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('common.name')} id="name">
        <Input
          id="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('accounts.namePlaceholder')}
        />
      </Field>

      <Field label={t('accounts.form.type')} id="type">
        <Select
          id="type"
          label={t('accounts.form.accountType')}
          value={type}
          options={TYPES.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => setType(v as Account['type'])}
        />
      </Field>

      <Field
        label={isCard ? t('accounts.form.currentDebt') : t('accounts.form.openingBalance')}
        id="opening"
      >
        <Input
          id="opening"
          inputMode="decimal"
          value={openingBalance}
          onChange={(event) => setOpeningBalance(event.target.value)}
          className="tabular"
        />
      </Field>

      {isCard && (
        <Field label={t('accounts.form.creditLimit')} id="limit">
          <Input
            id="limit"
            inputMode="decimal"
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
            className="tabular"
            placeholder="5000000"
          />
        </Field>
      )}
    </div>
  );
}

/** A new account's fields and how it is created. */
function useAccountForm(onDone: () => void) {
  const create = useCreateAccount();

  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('debit');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [creditLimit, setCreditLimit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isCard = type === 'credit';

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    try {
      await create.mutateAsync({
        name,
        type,
        openingBalance: openingBalance.replace(/[^\d.-]/g, '') || '0',
        ...(isCard && creditLimit ? { creditLimit: creditLimit.replace(/[^\d.]/g, '') } : {}),
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : t('accounts.createFailed'));
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
    isCard,
    isSaving: create.isPending,
    onSubmit,
  };
}

function ArchivedAccounts({ accounts }: { accounts: Account[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('accounts.archived')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </section>
  );
}

function NoAccounts({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <Wallet className="size-8 text-primary" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('accounts.empty')}</p>
        <Button onClick={onCreate}>{t('accounts.create')}</Button>
      </CardContent>
    </Card>
  );
}
