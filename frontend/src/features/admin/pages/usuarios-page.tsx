import { useState } from 'react';

import { useUsuarios } from '@/features/admin/api/admin-queries';
import { FilaDeUsuario } from '@/features/admin/components/user-row';
import { useAuth } from '@/shared/api/auth-context';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { CabeceraDePagina } from '@/shared/ui/atoms/cabecera-de-pagina';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Skeleton } from '@/shared/ui/atoms/skeleton';
import type { UserStatus } from '@coco/types';

const FILTROS: { valor: UserStatus | undefined; etiqueta: string }[] = [
  { valor: 'pending', etiqueta: 'Pendientes' },
  { valor: 'active', etiqueta: 'Activas' },
  { valor: 'suspended', etiqueta: 'Suspendidas' },
  { valor: undefined, etiqueta: 'Todas' },
];

/**
 * Aprobación de cuentas y gestión de roles.
 *
 * El filtro arranca en "Pendientes" porque son las que exigen una decisión:
 * el trabajo del administrador es responderlas, no navegar hasta encontrarlas.
 */
export function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const [filtro, setFiltro] = useState<UserStatus | undefined>('pending');
  const consulta = useUsuarios(filtro);

  return (
    <div className="flex flex-col gap-6">
      <CabeceraDePagina titulo="Usuarios" ayuda="Nadie entra a Coco sin que apruebes su cuenta." />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
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
          <AlertDescription>
            No se pudieron cargar las cuentas. Recarga la página e inténtalo de nuevo.
          </AlertDescription>
        </Alert>
      )}

      {consulta.data?.data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filtro === 'pending'
              ? 'No hay solicitudes esperando aprobación.'
              : 'No hay cuentas con ese estado.'}
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
