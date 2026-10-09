import { useState } from 'react';

import { useUsers } from '@/features/admin/api/admin-queries';
import { UserRow } from '@/features/admin/components/user-row';
import { useAuth } from '@/shared/api/auth-context';
import { type ProfileStatus } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { PageHeader } from '@/shared/ui/atoms/page-header';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

const FILTERS: { value: ProfileStatus | undefined; label: string }[] = [
  { value: 'pending', label: t('admin.users.filters.pending') },
  { value: 'active', label: t('admin.users.filters.active') },
  { value: 'suspended', label: t('admin.users.filters.suspended') },
  { value: undefined, label: t('admin.users.filters.all') },
];

/**
 * Aprobación de cuentas y gestión de roles.
 *
 * El filtro arranca en "Pendientes" porque son las que exigen una decisión:
 * el trabajo del administrador es responderlas, no navegar hasta encontrarlas.
 */
export function UsersPage() {
  const { user: me } = useAuth();
  const [filter, setFilter] = useState<ProfileStatus | undefined>('pending');
  const query = useUsers(filter);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('shell.sections.users')} description={t('admin.users.help')} />

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t('admin.users.filterByStatus')}
      >
        {FILTERS.map(({ value, label }) => (
          <Button
            key={label}
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </Button>
        ))}
      </div>

      {query.isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('admin.users.loadFailed')}</AlertDescription>
        </Alert>
      )}

      {query.data?.data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === 'pending' ? t('admin.users.emptyPending') : t('admin.users.emptyFiltered')}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {query.data?.data.map((user) => (
          <UserRow key={user.id} user={user} isMe={user.id === me?.id} />
        ))}
      </div>
    </div>
  );
}
