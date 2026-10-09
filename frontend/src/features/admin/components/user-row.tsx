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

import { useUserAction, useChangeRole, useResetPassword } from '@/features/admin/api/admin-queries';
import { ApiClientError } from '@/shared/api/api-client';
import { type Profile, type ProfileStatus } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Badge } from '@/shared/ui/atoms/badge';
import { Block } from '@/shared/ui/atoms/block';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { PasswordPolicy, meetsPolicy } from '@/shared/ui/atoms/password-policy';

/** La fila de una cuenta en Usuarios: quién es, en qué estado está y qué se le puede hacer. */

export function UserRow({ user, isMe }: { user: Profile; isMe: boolean }) {
  const action = useUserAction();
  const changeRole = useChangeRole();
  const [isResetting, setIsResetting] = useState(false);

  const error =
    action.error instanceof ApiClientError
      ? action.error.message
      : changeRole.error instanceof ApiClientError
        ? changeRole.error.message
        : null;

  const isBusy = action.isPending || changeRole.isPending;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <UserHeader user={user} isMe={isMe} />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <UserStatusActions
            user={user}
            isMe={isMe}
            isBusy={isBusy}
            onAction={(type) => action.mutate({ id: user.id, action: type })}
            onChangeRole={() =>
              changeRole.mutate({
                id: user.id,
                role: user.role === 'admin' ? 'user' : 'admin',
              })
            }
          />

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsResetting((isOpen) => !isOpen)}
            aria-expanded={isResetting}
          >
            <KeyRound aria-hidden="true" />
            {t('admin.userRow.resetPassword')}
          </Button>
        </div>

        {isResetting && <ResetPassword user={user} onDone={() => setIsResetting(false)} />}
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
function ResetPassword({ user, onDone }: { user: Profile; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [isDone, setIsDone] = useState(false);
  const reset = useResetPassword();

  const error = reset.error instanceof ApiClientError ? reset.error : null;

  if (isDone) {
    return <ResetDone user={user} />;
  }

  return (
    <Block className="p-4">
      <Field label={t('admin.userRow.newPassword')} id={`nueva-${user.id}`}>
        <Input
          id={`nueva-${user.id}`}
          type="text"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <PasswordPolicy password={password} />

      {error && <ResetError error={error} />}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={!meetsPolicy(password) || reset.isPending}
          onClick={() =>
            reset.mutate(
              { id: user.id, newPassword: password },
              { onSuccess: () => setIsDone(true) },
            )
          }
        >
          {reset.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t('admin.userRow.reset')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </Block>
  );
}

function StatusBadge({ status }: { status: ProfileStatus }) {
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

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Badge
      variant={isAdmin ? 'info' : 'outline'}
      className={cn(!isAdmin && 'text-muted-foreground')}
    >
      {isAdmin ? <ShieldCheck aria-hidden="true" /> : <UserIcon aria-hidden="true" />}
      {isAdmin ? t('admin.userRow.roleAdmin') : t('admin.userRow.roleUser')}
    </Badge>
  );
}

function ResetError({ error }: { error: ApiClientError }) {
  return (
    <div className="mt-3">
      <ErrorAlert message={error.message} details={error.details.map((d) => d.message)} />
    </div>
  );
}

function ResetDone({ user }: { user: Profile }) {
  return (
    <Alert variant="info">
      <AlertDescription>
        {t('admin.userRow.passwordReset', { name: user.displayName ?? user.email })}
      </AlertDescription>
    </Alert>
  );
}

interface UserStatusActionsProps {
  user: Profile;
  isMe: boolean;
  isBusy: boolean;
  onAction: (action: 'approve' | 'suspend' | 'reactivate') => void;
  onChangeRole: () => void;
}

/** Aprobar, reactivar, suspender y cambiar el rol: lo que se puede hacer según el estado. */
function UserStatusActions({ user, isMe, isBusy, onAction, onChangeRole }: UserStatusActionsProps) {
  return (
    <>
      {user.status === 'pending' && (
        <Button size="sm" disabled={isBusy} onClick={() => onAction('approve')}>
          {isBusy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
          {t('admin.userRow.approve')}
        </Button>
      )}

      {user.status === 'suspended' && (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => onAction('reactivate')}
        >
          <Play aria-hidden="true" />
          {t('admin.userRow.reactivate')}
        </Button>
      )}

      {user.status === 'active' && !isMe && (
        // Rojo solo aquí: suspender corta el acceso al instante y expulsa
        // a la persona aunque estuviera dentro.
        <Button
          size="sm"
          variant="destructive"
          disabled={isBusy}
          onClick={() => onAction('suspend')}
        >
          <Slash aria-hidden="true" />
          {t('admin.userRow.suspend')}
        </Button>
      )}

      {!isMe && (
        <Button size="sm" variant="outline" disabled={isBusy} onClick={onChangeRole}>
          <ShieldCheck aria-hidden="true" />
          {user.role === 'admin' ? t('admin.userRow.removeAdmin') : t('admin.userRow.makeAdmin')}
        </Button>
      )}
    </>
  );
}

function UserHeader({ user, isMe }: { user: Profile; isMe: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{user.displayName ?? user.email}</span>
          {isMe && <span className="text-xs text-muted-foreground">{t('admin.userRow.you')}</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>

      <div className="flex shrink-0 gap-2">
        <StatusBadge status={user.status} />
        <RoleBadge isAdmin={user.role === 'admin'} />
      </div>
    </div>
  );
}
