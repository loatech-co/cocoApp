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
 * My account: change the password and sign out everywhere.
 *
 * The two actions someone who suspects their account is compromised must be
 * able to take, without depending on anyone.
 */
export function AccountPage() {
  const { user, isAdmin } = useAuth();
  /*
    Inside the phone app this page is the «Más» tab, and it does what the
    avatar sheet does outside —which is not mounted there—: lead to the admin
    and sign out on THIS device. Outside the app none of that shows, because
    it is already in the sheet or in the rail menu.
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

      {/* The scroll margin is the phone top bar's height plus a little: without
          it, the section just reached sits right UNDER the brand strip, which
          is stuck on top. */}
      <section id="ajustes" className="scroll-mt-20">
        <Settings />
      </section>

      {isEmbedded && isAdmin && <AdminLinks />}

      {/* The two things someone who suspects their account is compromised does,
          together and with a name: change the password and kick everyone
          out. Apart, there was nowhere to point to from outside. */}
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

/** The two passwords, their errors and the submit of the change. */
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

/** Signing out: here, inside the app, and on every device. */
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
        {/* The same sections, in the same order, as the rail and the avatar
            sheet: a second list would drift from this one the first time a
            screen is added. */}
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
    ── The anchors ───────────────────────────────────────────────────────────
    The phone's account sheet offers «Ajustes» and «Seguridad» as two
    different entries, and both lead here: they are two PARTS of this page,
    not two screens. Splitting it in three would leave three one-card screens.

    And the view has to be taken to the spot by hand because the router does
    not: it changes the route without touching the scroll, so «Seguridad»
    left the person at the very top looking at the settings.
  */
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);
}
