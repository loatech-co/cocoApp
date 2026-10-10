import { Loader2, LogIn } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { authErrorMessage, useAuth } from '@/shared/api/auth-context';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { Logo } from '@/shared/ui/atoms/logo';
import { TextLink } from '@/shared/ui/atoms/text-link';

/**
 * Sign in.
 *
 * No "forgot it?": no emails are sent yet, so a recovery link would be a
 * promise the app cannot keep. Whoever forgets their password gets it back by
 * asking the admin, who can reset it from the panel. When email sending
 * exists, the link goes here.
 */
export function LoginPage() {
  const { user, isLoading, signIn } = useAuth();

  const form = useLoginForm(signIn);

  /*
    With a session, there is nothing to do here.

    In practice it is almost never reached: `RequireAuth` stops drawing this
    page in the same render the session appears in. It stays for the path that
    does exist —the tab that had the login open while signing in from
    another—, and so that the page holds up on its own if it ever gets its own
    route again.
  */
  if (!isLoading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* The form goes FIRST in the DOM as well as on the left: it is what the
          person came to do, and whoever navigates by keyboard or screen
          reader finds it without crossing the decoration first. */}
      <section className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 lg:min-h-0">
        <div className="w-full max-w-sm">
          {/*
          The logo goes in LIME, on a forest plate.

          Lime straight on the light background gives 1.14:1 contrast: that
          is not low, it is invisible. And the only tone of the family that
          reaches 3:1 is a dark olive that no longer reads as lime.

          So it does what the reference does: lime lives on dark. Inside the
          plate it gives 10.1:1, the same pair as in the sidebar, and the
          brand looks identical on both screens.
        */}
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
          <h1 className="sr-only">{t('auth.login.documentTitle')}</h1>

          <Logo className="mx-auto mb-8 h-11 w-auto text-sidebar-active" />

          <LoginCard form={form} />

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t('auth.login.forgotPassword')}
          </p>
        </div>
      </section>

      <LoginBrand />
    </main>
  );
}

/** The brand half, on a wide screen. */
function LoginBrand() {
  return (
    <>
      {/*
      The brand half. On mobile it DISAPPEARS, it does not stack: a phone has
      no height to spend on decoration before the form, and pushing the email
      field below the fold is the fastest way to make someone give up.

      The padding goes on the CONTAINER and the rounding on the image: that
      way the image breathes against the screen edge instead of bleeding,
      which is what was asked for.
    */}
      <section className="hidden bg-background p-6 lg:block">
        {/*
        The padding goes on the CONTAINER and the rounding on the image: that
        way it breathes against the screen edge instead of bleeding.

        Through CSS and not with <img>: if the image does not load —slow
        network, a browser without WebP— the green background stays and the
        screen is still usable. A broken <img> would leave the broken-image
        icon.

        WebP without a JPG fallback on purpose: every browser has supported
        it since 2020. The original lives in frontend/assets-source/, with how
        to regenerate it.
      */}
        <div
          className="relative size-full overflow-hidden rounded-lg bg-primary bg-cover bg-center"
          style={{ backgroundImage: 'url(/login-background.webp)' }}
        >
          {/*
          A British-green gradient from the bottom.

          It is not decoration: the image has very light lime areas, and white
          text over one of those strips disappears. The gradient guarantees
          that the bottom —where the text goes— is always dark, wherever the
          image gets cropped.

          It rises to 55% and not all the way up so as not to dim the whole
          image: the top stays clean.
        */}
          <div className="absolute inset-x-0 bottom-0 h-11/20 bg-gradient-to-t from-primary via-primary/70 to-transparent" />

          {/* `text-primary-foreground` and not white. The gradient below is
            `--primary`, and in dark that primary is the theme's LIGHT teal:
            white on it gave 1.9:1 and the sentence disappeared. The
            primary's ink is, by definition, the one that reads on it —white
            in light, near black in dark— with no choice to make. */}
          <p className="absolute inset-x-0 bottom-0 p-10 text-5xl font-bold leading-hero tracking-tight text-primary-foreground xl:p-14 xl:text-6xl">
            {t('auth.login.taglineFirst')}
            <br />
            {t('auth.login.taglineSecond')}
          </p>
        </div>
      </section>
    </>
  );
}

function LoginCard({ form }: { form: ReturnType<typeof useLoginForm> }) {
  const { email, setEmail, password, setPassword, error, isSending, onSubmit } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.login.greeting')}</CardTitle>
        <CardDescription>{t('auth.login.help')}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label={t('auth.fields.email')} id="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={error !== null}
            />
          </Field>

          <Field label={t('auth.fields.password')} id="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={error !== null}
            />
          </Field>

          <LoginSubmit isSending={isSending} />
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.login.noAccount')}
          <TextLink to="/sign-up">{t('auth.requestAccess')}</TextLink>
        </p>
      </CardContent>
    </Card>
  );
}

/** The email, the password and the submit of the sign-in form. */
function useLoginForm(signIn: ReturnType<typeof useAuth>['signIn']) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    setIsSending(true);

    void signIn(email, password)
      .catch((cause: unknown) => setError(authErrorMessage(cause)))
      .finally(() => setIsSending(false));
  }

  return { email, setEmail, password, setPassword, error, isSending, onSubmit };
}

function LoginSubmit({ isSending }: { isSending: boolean }) {
  return (
    <Button type="submit" className="w-full" disabled={isSending}>
      {isSending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <LogIn aria-hidden="true" />
      )}
      {isSending ? t('auth.wait') : t('auth.signIn')}
    </Button>
  );
}
