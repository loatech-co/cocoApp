import { Loader2, UserPlus } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { errorDetails, authErrorMessage, useAuth } from '@/shared/api/auth-context';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription, AlertTitle, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { Logo } from '@/shared/ui/atoms/logo';
import { PasswordPolicy, meetsPolicy } from '@/shared/ui/atoms/password-policy';
import { TextLink } from '@/shared/ui/atoms/text-link';

/**
 * Request access.
 *
 * It is not "create an account and sign in": every account is born pending
 * and needs an admin's approval. It is said from the start, so nobody signs
 * up expecting to get in right away.
 */
export function RegisterPage() {
  const { user, isLoading, signUp } = useAuth();
  const form = useRegisterForm(signUp);

  if (!isLoading && user) {
    return <Navigate to="/" replace />;
  }

  if (form.submitted) {
    return <RequestReceived status={form.submitted} />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        {/* h-11 ≈ 168px wide, which is what the plate that sat behind it measured
            (24px + logo + 24px). `mx-auto` and not `text-center`: it is a
            BLOCK SVG with automatic width, and centering text would not move
            it. */}
        {/*
          This screen's level-1 heading.

          It is not painted because what shows is already the logo, but it
          has to EXIST: without it, the page's only hierarchy was the card's
          `<h2>`, so whoever navigates with a screen reader jumped from
          heading to heading and here found none for the rest to hang from.
          The logo is an SVG and cannot play that role.
        */}
        <h1 className="sr-only">{t('auth.register.documentTitle')}</h1>

        <Logo className="mx-auto mb-8 h-11 w-auto text-sidebar-active" />

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.requestAccess')}</CardTitle>
            <CardDescription>{t('auth.register.help')}</CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <RegisterErrors error={form.error} problems={form.problems} />

            <RegisterForm form={form} />

            <p className="text-center text-sm text-muted-foreground">
              {t('auth.register.haveAccount')}
              <TextLink to="/">{t('auth.signIn')}</TextLink>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/**
 * A deliberately vague confirmation about whether the email already existed.
 *
 * The API answers the same in both cases —that is what stops the sign-up
 * being used to find out who has an account— and the UI respects that
 * decision. For a legitimate person nothing changes: in both cases they wait
 * for approval.
 */
function RequestReceived({ status }: { status: 'pendiente' | 'lista' }) {
  const isReady = status === 'lista';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm text-center">
        {/* h-11 ≈ 168px wide, which is what the plate that sat behind it measured
            (24px + logo + 24px). `mx-auto` and not `text-center`: it is a
            BLOCK SVG with automatic width, and centering text would not move
            it. */}
        <h1 className="sr-only">{t('auth.register.sentDocumentTitle')}</h1>

        <Logo className="mx-auto mb-8 h-11 w-auto text-sidebar-active" />

        <Alert variant="info" className="text-left">
          <AlertTitle>
            {isReady ? t('auth.register.readyTitle') : t('auth.register.receivedTitle')}
          </AlertTitle>
          <AlertDescription>
            {isReady ? t('auth.register.readyHelp') : t('auth.register.receivedHelp')}
          </AlertDescription>
        </Alert>

        {/* Underlined always, not on hover: a loose link with only its color
            to tell it apart from the text is not seen as one (and on a
            phone there is no hover to discover it). */}
        <Link
          to="/"
          className="mt-6 inline-block text-sm text-primary underline underline-offset-4"
        >
          {isReady ? t('auth.signIn') : t('auth.register.backToSignIn')}
        </Link>
      </div>
    </main>
  );
}

function PasswordField({
  password,
  onChange,
}: {
  password: string;
  onChange: (password: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Field label={t('auth.fields.password')} id="password">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby="requisitos-password"
        />
      </Field>
      <div id="requisitos-password">
        <PasswordPolicy password={password} />
        <p className="mt-2 text-xs text-muted-foreground">{t('auth.register.passwordHelp')}</p>
      </div>
    </div>
  );
}

function RegisterForm({ form }: { form: ReturnType<typeof useRegisterForm> }) {
  const { name, setName, email, setEmail, password, setPassword, isSending, onSubmit } = form;
  const isPolicyOk = meetsPolicy(password);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label={t('auth.fields.name')} id="nombre">
        <Input
          id="nombre"
          autoComplete="name"
          required
          minLength={2}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label={t('auth.fields.email')} id="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <PasswordField password={password} onChange={setPassword} />

      <Button type="submit" className="w-full" disabled={isSending || !isPolicyOk}>
        {isSending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus aria-hidden="true" />
        )}
        {isSending ? t('auth.wait') : t('auth.requestAccess')}
      </Button>
    </form>
  );
}

function RegisterErrors({ error, problems }: { error: string | null; problems: string[] }) {
  if (!error) return null;
  return <ErrorAlert message={error} details={problems} />;
}

/** The request's fields, their errors and the submit. */
function useRegisterForm(signUp: ReturnType<typeof useAuth>['signUp']) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [submitted, setSubmitted] = useState<'pendiente' | 'lista' | null>(null);

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    setProblems([]);
    setIsSending(true);

    void signUp(email, password, name)
      .then((response) => setSubmitted(response.pendingApproval ? 'pendiente' : 'lista'))
      .catch((cause: unknown) => {
        setError(authErrorMessage(cause));
        // The API says exactly what the password is missing; hiding it would
        // force guessing and push toward the weakest thing that passes.
        setProblems(errorDetails(cause));
      })
      .finally(() => setIsSending(false));
  }

  return {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    error,
    problems,
    isSending,
    submitted,
    onSubmit,
  };
}
