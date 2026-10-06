import { useState } from 'react';

import { useUsuarios } from '@/features/admin/api/admin-queries';
import { FilaDeUsuario } from '@/features/admin/components/user-row';
import { useAuth } from '@/shared/api/auth-context';
import { type ProfileStatus } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { PageHeader } from '@/shared/ui/atoms/page-header';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

const FILTROS: { valor: ProfileStatus | undefined; etiqueta: string }[] = [
  { valor: 'pending', etiqueta: t('admin.users.filters.pending') },
  { valor: 'active', etiqueta: t('admin.users.filters.active') },
  { valor: 'suspended', etiqueta: t('admin.users.filters.suspended') },
  { valor: undefined, etiqueta: t('admin.users.filters.all') },
];

/**
 * Aprobación de cuentas y gestión de roles.
 *
 * El filtro arranca en "Pendientes" porque son las que exigen una decisión:
 * el trabajo del administrador es responderlas, no navegar hasta encontrarlas.
 */
export function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const [filtro, setFiltro] = useState<ProfileStatus | undefined>('pending');
  const consulta = useUsuarios(filtro);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('shell.sections.users')} description={t('admin.users.help')} />

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t('admin.users.filterByStatus')}
      >
        {FILTROS.map(({ valor, etiqueta }) => (
          <Button
            key={etiqueta}
            size="sm"
            variant={filtro === valor ? 'default' : 'outline'}
            onClick={() => setFiltro(valor)}
            aria-pressed={filtro === valor}
          >
            {etiqueta}
          </Button>
        ))}
      </div>

      {consulta.isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {consulta.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('admin.users.loadFailed')}</AlertDescription>
        </Alert>
      )}

      {consulta.data?.data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filtro === 'pending' ? t('admin.users.emptyPending') : t('admin.users.emptyFiltered')}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {consulta.data?.data.map((usuario) => (
          <FilaDeUsuario key={usuario.id} usuario={usuario} soyYo={usuario.id === yo?.id} />
        ))}
      </div>
    </div>
  );
}
