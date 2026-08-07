import type { PerfilPublico, UserStatus } from '@coco/types';
import {
  AlertCircle,
  Check,
  Clock,
  KeyRound,
  Loader2,
  Play,
  ShieldCheck,
  Slash,
  User as UserIcon,
} from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  PoliticaDeContrasena,
  cumpleLaPolitica,
} from '@/features/auth/politica-de-contrasena';
import {
  useAccionSobreUsuario,
  useCambiarRol,
  useRestablecerContrasena,
  useUsuarios,
} from './admin-queries';

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
      <header>
        <h1 className="font-serif text-3xl font-semibold">Cuentas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nadie entra a Coco sin que apruebes su cuenta.
        </p>
      </header>

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
          <AlertCircle aria-hidden="true" />
          <AlertDescription>
            No se pudieron cargar las cuentas. Recarga la página e inténtalo de nuevo.
          </AlertDescription>
        </Alert>
      )}

      {consulta.data && consulta.data.data.length === 0 && (
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

function FilaDeUsuario({ usuario, soyYo }: { usuario: PerfilPublico; soyYo: boolean }) {
  const accion = useAccionSobreUsuario();
  const cambiarRol = useCambiarRol();
  const [restableciendo, setRestableciendo] = useState(false);

  const error =
    accion.error instanceof ApiClientError
      ? accion.error.message
      : cambiarRol.error instanceof ApiClientError
        ? cambiarRol.error.message
        : null;

  const ocupado = accion.isPending || cambiarRol.isPending;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              <span className="truncate">{usuario.display_name ?? usuario.email}</span>
              {soyYo && <span className="text-xs text-muted-foreground">(tú)</span>}
            </p>
            <p className="truncate text-sm text-muted-foreground">{usuario.email}</p>
          </div>

          <div className="flex shrink-0 gap-2">
            <EstadoBadge status={usuario.status} />
            <RolBadge esAdmin={usuario.role === 'admin'} />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {usuario.status === 'pending' && (
            <Button
              size="sm"
              disabled={ocupado}
              onClick={() => accion.mutate({ id: usuario.id, accion: 'approve' })}
            >
              {ocupado ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              Aprobar
            </Button>
          )}

          {usuario.status === 'suspended' && (
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => accion.mutate({ id: usuario.id, accion: 'reactivate' })}
            >
              <Play aria-hidden="true" />
              Reactivar
            </Button>
          )}

          {usuario.status === 'active' && !soyYo && (
            // Rojo solo aquí: suspender corta el acceso al instante y expulsa
            // a la persona aunque estuviera dentro.
            <Button
              size="sm"
              variant="destructive"
              disabled={ocupado}
              onClick={() => accion.mutate({ id: usuario.id, accion: 'suspend' })}
            >
              <Slash aria-hidden="true" />
              Suspender
            </Button>
          )}

          {!soyYo && (
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() =>
                cambiarRol.mutate({
                  id: usuario.id,
                  role: usuario.role === 'admin' ? 'user' : 'admin',
                })
              }
            >
              <ShieldCheck aria-hidden="true" />
              {usuario.role === 'admin' ? 'Quitar administración' : 'Hacer administrador'}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRestableciendo((abierto) => !abierto)}
            aria-expanded={restableciendo}
          >
            <KeyRound aria-hidden="true" />
            Restablecer contraseña
          </Button>
        </div>

        {restableciendo && (
          <RestablecerContrasena usuario={usuario} onListo={() => setRestableciendo(false)} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Restablecimiento manual de contraseña.
 *
 * Existe porque todavía no se envían correos: sin autoservicio de
 * recuperación, el administrador es el único camino de vuelta. La contraseña
 * nueva se muestra una sola vez, aquí, para que puedas comunicarla por el
 * canal que quieras — no se guarda ni se envía a ninguna parte.
 */
function RestablecerContrasena({
  usuario,
  onListo,
}: {
  usuario: PerfilPublico;
  onListo: () => void;
}) {
  const [password, setPassword] = useState('');
  const [hecho, setHecho] = useState(false);
  const restablecer = useRestablecerContrasena();

  const error = restablecer.error instanceof ApiClientError ? restablecer.error : null;

  if (hecho) {
    return (
      <Alert variant="info">
        <Check aria-hidden="true" />
        <AlertDescription>
          Listo. Comunícale la contraseña nueva a {usuario.display_name ?? usuario.email} por un
          canal seguro. Sus sesiones abiertas se cerraron.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="rounded-md border border-border bg-secondary/40 p-4">
      <Label htmlFor={`nueva-${usuario.id}`}>Contraseña nueva</Label>
      <Input
        id={`nueva-${usuario.id}`}
        type="text"
        autoComplete="off"
        className="mt-2"
        value={password}
        onChange={(evento) => setPassword(evento.target.value)}
      />
      <PoliticaDeContrasena password={password} />

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>
            {error.message}
            {error.details.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4">
                {error.details.map((detalle) => (
                  <li key={detalle.message}>{detalle.message}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={!cumpleLaPolitica(password) || restablecer.isPending}
          onClick={() =>
            restablecer.mutate(
              { id: usuario.id, newPassword: password },
              { onSuccess: () => setHecho(true) },
            )
          }
        >
          {restablecer.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Restablecer
        </Button>
        <Button size="sm" variant="ghost" onClick={onListo}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function EstadoBadge({ status }: { status: UserStatus }) {
  // Icono además del color: el estado debe leerse sin distinguir colores.
  if (status === 'pending') {
    return (
      <Badge variant="warning">
        <Clock aria-hidden="true" />
        Pendiente
      </Badge>
    );
  }
  if (status === 'suspended') {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        <Slash aria-hidden="true" />
        Suspendida
      </Badge>
    );
  }
  return (
    <Badge variant="income">
      <Check aria-hidden="true" />
      Activa
    </Badge>
  );
}

function RolBadge({ esAdmin }: { esAdmin: boolean }) {
  return (
    <Badge variant={esAdmin ? 'info' : 'outline'} className={cn(!esAdmin && 'text-muted-foreground')}>
      {esAdmin ? <ShieldCheck aria-hidden="true" /> : <UserIcon aria-hidden="true" />}
      {esAdmin ? 'Administrador' : 'Usuario'}
    </Badge>
  );
}
