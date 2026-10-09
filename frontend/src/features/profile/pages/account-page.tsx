import { LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useLocation } from 'react-router-dom';

import { Settings } from '@/features/profile/components/settings';
import { errorDetails, authErrorMessage, useAuth } from '@/shared/api/auth-context';
import { t } from '@/shared/lib/i18n';
import { useIsInNativeApp } from '@/shared/lib/mobile';
import { ADMIN_SECTIONS } from '@/shared/lib/sections';
import { Alert, AlertDescription, AlertTitle, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Badge } from '@/shared/ui/atoms/badge';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { PageHeader } from '@/shared/ui/atoms/page-header';
import { PasswordPolicy, meetsPolicy } from '@/shared/ui/atoms/password-policy';
import { LinkRow } from '@/shared/ui/molecules/link-row';

/**
 * Mi cuenta: cambiar contraseña y cerrar sesión en todas partes.
 *
 * Las dos acciones que tiene que poder hacer alguien que sospecha que su cuenta
 * está comprometida, sin depender de nadie.
 */
export function AccountPage() {
  const { user, isAdmin } = useAuth();
  /*
    Dentro de la app del teléfono esta página es la pestaña «Más», y hace lo
    que fuera hace la hoja del avatar —que allí no se monta—: llevar a la
    administración y cerrar sesión en ESTE dispositivo. Fuera de la app nada
    de eso aparece, porque ya está en la hoja o en el menú del riel.
  */
  const isEmbedded = useIsInNativeApp();

  useScrollToHash();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('shell.account.myAccount')} description={user?.email} />

      {isAdmin && (
        <Badge variant="info" className="self-start">
          <ShieldCheck aria-hidden="true" />
          {t('admin.userRow.roleAdmin')}
        </Badge>
      )}

      {/* El margen de desplazamiento es el alto del techo del teléfono más un
          poco: sin él, la sección a la que se acaba de llegar queda justo
          DEBAJO de la franja de la marca, que está pegada arriba. */}
      <section id="ajustes" className="scroll-mt-20">
        <Settings />
      </section>

      {isEmbedded && isAdmin && <AdminLinks />}

      {/* Las dos cosas que hace alguien que sospecha que su cuenta está
          comprometida, juntas y con un nombre: cambiar la contraseña y echar
          a todo el mundo. Separadas no había a dónde apuntar desde fuera. */}
      <section id="seguridad" className="flex scroll-mt-20 flex-col gap-6">
        <ChangePassword />

        <SessionCards isEmbedded={isEmbedded} />
      </section>
    </div>
  );
}

function ChangePassword() {
  const form = usePasswordChange();

  if (form.isDone) {
    return (
      <Alert variant="info">
        <AlertTitle>{t('profile.account.passwordChangedTitle')}</AlertTitle>
        <AlertDescription>{t('profile.account.passwordChangedHelp')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.account.changePassword')}</CardTitle>
        <CardDescription>{t('profile.account.changePasswordHelp')}</CardDescription>
      </CardHeader>

      <CardContent>
        {form.error && <PasswordErrors error={form.error} problems={form.problems} />}

        <PasswordForm form={form} />
      </CardContent>
    </Card>
  );
}

function PasswordForm({ form }: { form: ReturnType<typeof usePasswordChange> }) {
  const { actual, setActual, newPassword, setNewPassword, isSending, onSubmit } = form;
  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
      <Field label={t('profile.account.currentPassword')} id="actual">
        <Input
          id="actual"
          type="password"
          autoComplete="current-password"
          required
          value={actual}
          onChange={(event) => setActual(event.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Field label={t('admin.userRow.newPassword')} id="nueva">
          <Input
            id="nueva"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            aria-describedby="requisitos-nueva"
          />
        </Field>
        <div id="requisitos-nueva">
          <PasswordPolicy password={newPassword} />
        </div>
      </div>

      <Button type="submit" disabled={isSending || !meetsPolicy(newPassword) || !actual}>
        {t('profile.account.changePassword')}
      </Button>
    </form>
  );
}

function PasswordErrors({ error, problems }: { error: string; problems: string[] }) {
  return (
    <div className="mb-4">
      <ErrorAlert message={error} details={problems} />
    </div>
  );
}

/** Las dos contraseñas, sus errores y el envío del cambio. */
function usePasswordChange() {
  const { changePassword } = useAuth();

  const [actual, setActual] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isDone, setIsDone] = useState(false);

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    setProblems([]);
    setIsSending(true);

    void changePassword(actual, newPassword)
      .then(() => setIsDone(true))
      .catch((cause: unknown) => {
        setError(authErrorMessage(cause));
        setProblems(errorDetails(cause));
      })
      .finally(() => setIsSending(false));
  }

  return {
    actual,
    setActual,
    newPassword,
    setNewPassword,
    error,
    problems,
    isSending,
    isDone,
    onSubmit,
  };
}

/** Cerrar sesión: aquí, dentro de la app, y en todos los dispositivos. */
function SessionCards({ isEmbedded }: { isEmbedded: boolean }) {
  const { signOut, signOutEverywhere } = useAuth();
  return (
    <>
      {isEmbedded && (
        <Card>
          <CardHeader>
            <CardTitle>{t('shell.account.signOut')}</CardTitle>
            <CardDescription>{t('profile.account.signOutHelp')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut aria-hidden="true" />
              {t('shell.account.signOut')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.account.signOutAllTitle')}</CardTitle>
          <CardDescription>{t('profile.account.signOutAllHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void signOutEverywhere()}>
            <LogOut aria-hidden="true" />
            {t('profile.account.signOutAll')}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function AdminLinks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('shell.rail.admin')}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Las mismas secciones, en el mismo orden, que el riel y la hoja
            del avatar: una segunda lista se separaría de esta la primera
            vez que se añada una pantalla. */}
        <nav aria-label={t('shell.rail.admin')} className="-mx-3 flex flex-col">
          {ADMIN_SECTIONS.map((section) => (
            <LinkRow key={section.to} Icon={section.Icon} to={section.to}>
              {section.label}
            </LinkRow>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}

function useScrollToHash(): void {
  const { hash } = useLocation();
  /*
    ── Las anclas ────────────────────────────────────────────────────────────
    La hoja de la cuenta del teléfono ofrece «Ajustes» y «Seguridad» como dos
    entradas distintas, y las dos llevan aquí: son dos TROZOS de esta página,
    no dos pantallas. Partirla en tres dejaría tres pantallas de una tarjeta.

    Y hace falta llevar la vista al sitio a mano porque el enrutador no lo
    hace: cambia la ruta sin tocar el desplazamiento, así que «Seguridad»
    dejaba a la persona arriba del todo mirando los ajustes.
  */
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);
}
