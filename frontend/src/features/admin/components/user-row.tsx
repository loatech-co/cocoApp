import {
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

import {
  useAccionSobreUsuario,
  useCambiarRol,
  useRestablecerContrasena,
} from '@/features/admin/api/admin-queries';
import { ApiClientError } from '@/shared/api/api-client';
import { type Profile, type ProfileStatus } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Badge } from '@/shared/ui/atoms/badge';
import { Bloque } from '@/shared/ui/atoms/bloque';
import { Button } from '@/shared/ui/atoms/button';
import { Campo } from '@/shared/ui/atoms/campo';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Input } from '@/shared/ui/atoms/input';
import { PoliticaDeContrasena, cumpleLaPolitica } from '@/shared/ui/atoms/politica-de-contrasena';

/** La fila de una cuenta en Usuarios: quién es, en qué estado está y qué se le puede hacer. */

export function FilaDeUsuario({ usuario, soyYo }: { usuario: Profile; soyYo: boolean }) {
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
        <UserHeader usuario={usuario} soyYo={soyYo} />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <UserStatusActions
            usuario={usuario}
            soyYo={soyYo}
            ocupado={ocupado}
            onAccion={(tipo) => accion.mutate({ id: usuario.id, accion: tipo })}
            onCambiarRol={() =>
              cambiarRol.mutate({
                id: usuario.id,
                role: usuario.role === 'admin' ? 'user' : 'admin',
              })
            }
          />

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRestableciendo((abierto) => !abierto)}
            aria-expanded={restableciendo}
          >
            <KeyRound aria-hidden="true" />
            {t('admin.userRow.resetPassword')}
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
function RestablecerContrasena({ usuario, onListo }: { usuario: Profile; onListo: () => void }) {
  const [password, setPassword] = useState('');
  const [hecho, setHecho] = useState(false);
  const restablecer = useRestablecerContrasena();

  const error = restablecer.error instanceof ApiClientError ? restablecer.error : null;

  if (hecho) {
    return <ResetDone usuario={usuario} />;
  }

  return (
    <Bloque className="p-4">
      <Campo etiqueta={t('admin.userRow.newPassword')} id={`nueva-${usuario.id}`}>
        <Input
          id={`nueva-${usuario.id}`}
          type="text"
          autoComplete="off"
          value={password}
          onChange={(evento) => setPassword(evento.target.value)}
        />
      </Campo>
      <PoliticaDeContrasena password={password} />

      {error && <ResetError error={error} />}

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
          {t('admin.userRow.reset')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onListo}>
          {t('common.cancel')}
        </Button>
      </div>
    </Bloque>
  );
}

function EstadoBadge({ status }: { status: ProfileStatus }) {
  // Icono además del color: el estado debe leerse sin distinguir colores.
  if (status === 'pending') {
    return (
      <Badge variant="warning">
        <Clock aria-hidden="true" />
        {t('admin.userRow.statusPending')}
      </Badge>
    );
  }
  if (status === 'suspended') {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        <Slash aria-hidden="true" />
        {t('admin.userRow.statusSuspended')}
      </Badge>
    );
  }
  return (
    <Badge variant="income">
      <Check aria-hidden="true" />
      {t('admin.userRow.statusActive')}
    </Badge>
  );
}

function RolBadge({ esAdmin }: { esAdmin: boolean }) {
  return (
    <Badge
      variant={esAdmin ? 'info' : 'outline'}
      className={cn(!esAdmin && 'text-muted-foreground')}
    >
      {esAdmin ? <ShieldCheck aria-hidden="true" /> : <UserIcon aria-hidden="true" />}
      {esAdmin ? t('admin.userRow.roleAdmin') : t('admin.userRow.roleUser')}
    </Badge>
  );
}

function ResetError({ error }: { error: ApiClientError }) {
  return (
    <div className="mt-3">
      <ErrorAlert mensaje={error.message} detalles={error.details.map((d) => d.message)} />
    </div>
  );
}

function ResetDone({ usuario }: { usuario: Profile }) {
  return (
    <Alert variant="info">
      <AlertDescription>
        {t('admin.userRow.passwordReset', { name: usuario.displayName ?? usuario.email })}
      </AlertDescription>
    </Alert>
  );
}

interface UserStatusActionsProps {
  usuario: Profile;
  soyYo: boolean;
  ocupado: boolean;
  onAccion: (accion: 'approve' | 'suspend' | 'reactivate') => void;
  onCambiarRol: () => void;
}

/** Aprobar, reactivar, suspender y cambiar el rol: lo que se puede hacer según el estado. */
function UserStatusActions({
  usuario,
  soyYo,
  ocupado,
  onAccion,
  onCambiarRol,
}: UserStatusActionsProps) {
  return (
    <>
      {usuario.status === 'pending' && (
        <Button size="sm" disabled={ocupado} onClick={() => onAccion('approve')}>
          {ocupado ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
          {t('admin.userRow.approve')}
        </Button>
      )}

      {usuario.status === 'suspended' && (
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() => onAccion('reactivate')}
        >
          <Play aria-hidden="true" />
          {t('admin.userRow.reactivate')}
        </Button>
      )}

      {usuario.status === 'active' && !soyYo && (
        // Rojo solo aquí: suspender corta el acceso al instante y expulsa
        // a la persona aunque estuviera dentro.
        <Button
          size="sm"
          variant="destructive"
          disabled={ocupado}
          onClick={() => onAccion('suspend')}
        >
          <Slash aria-hidden="true" />
          {t('admin.userRow.suspend')}
        </Button>
      )}

      {!soyYo && (
        <Button size="sm" variant="outline" disabled={ocupado} onClick={onCambiarRol}>
          <ShieldCheck aria-hidden="true" />
          {usuario.role === 'admin' ? t('admin.userRow.removeAdmin') : t('admin.userRow.makeAdmin')}
        </Button>
      )}
    </>
  );
}

function UserHeader({ usuario, soyYo }: { usuario: Profile; soyYo: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{usuario.displayName ?? usuario.email}</span>
          {soyYo && <span className="text-xs text-muted-foreground">{t('admin.userRow.you')}</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{usuario.email}</p>
      </div>

      <div className="flex shrink-0 gap-2">
        <EstadoBadge status={usuario.status} />
        <RolBadge esAdmin={usuario.role === 'admin'} />
      </div>
    </div>
  );
}
