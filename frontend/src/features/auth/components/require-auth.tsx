import { Loader2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { LoginPage } from '@/features/auth/pages/login-page';
import { useAuth } from '@/shared/api/auth-context';
import { notifyApp, isInNativeApp } from '@/shared/lib/bridge';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';

/**
 * No session: the login, and the address bar on the index.
 *
 * ── Why there is no longer a route to go to ─────────────────────────────────
 * There was one —`/entrar`— and the price was that signing out left that
 * address showing. An internal URL stayed in view, on the screen the most
 * different people see, saying where a private app is entered from. And it
 * adds nothing: whoever signs out did not choose to go anywhere.
 *
 * Now the login is DRAWN where signing in was being asked for, and the address
 * is always `/`. A single public URL, the shortest, and nothing to clean up
 * after signing out.
 *
 * ── What is lost, and accepted ──────────────────────────────────────────────
 * Going back, after signing in, to the page that had been asked for. It was
 * carried in the navigation state to `/entrar`, and without that navigation
 * there is nowhere to carry it: drawn in place, the login unmounts in the same
 * render the session appears in, so it never gets to navigate anywhere.
 *
 * In exchange, whoever signs in always lands on the dashboard, which is where
 * everything else starts from.
 */
function NoSession({ isInIndex }: { isInIndex: boolean }) {
  // Inside the app there is no web login: the app holds the session and it
  // is the app that pushes it. No `LoginPage`, and no `Navigate`: the route
  // stays where the app put it, so that when the session arrives that page
  // is drawn and not the dashboard.
  if (isInNativeApp()) return <SessionFromApp />;

  // On any other route it goes back to the index first: otherwise the
  // address bar stays on a page that is no longer being seen —the login on
  // top of `/administracion`—, which is exactly what this set out to remove.
  return isInIndex ? <LoginPage /> : <Navigate to="/" replace />;
}

/**
 * The embedded web has no session: it tells the app and waits.
 *
 * It notifies ONCE per mount, not on every render: the app answers by pushing
 * a session if it has one, and one notice per render would be polling. What
 * the app does with the notice is its business —if it has no session, it
 * shows its own native login on top—; this screen only waits.
 */
function SessionFromApp() {
  useEffect(() => {
    notifyApp({ tipo: 'sinSesion' });
  }, []);

  return <Waiting text={t('auth.guard.openingFromApp')} />;
}

/**
 * Client route guard.
 *
 * It is a navigation convenience, NOT security: what rules is the backend's
 * JwtAuthGuard, which verifies the token and queries the database on every
 * request. Even if someone forced the route, the API would not return a
 * single piece of data.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Waiting />;
  }

  if (!user) {
    return <NoSession isInIndex={location.pathname === '/'} />;
  }

  return <>{children}</>;
}

/**
 * Guard for the admin routes.
 *
 * Same as above: the backend's RolesGuard is what really decides. This only
 * avoids showing a screen the API is going to reject. The role is read from
 * the profile the server returns, never from something the client can alter.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Waiting />;
  }

  if (!user) {
    return <NoSession isInIndex={location.pathname === '/'} />;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Alert variant="destructive">
          <AlertTitle>{t('auth.guard.forbiddenTitle')}</AlertTitle>
          <AlertDescription>{t('auth.guard.forbiddenHelp')}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <a href="/">{t('auth.guard.backHome')}</a>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

function Waiting({ text = t('auth.guard.verifying') }: { text?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </div>
  );
}
