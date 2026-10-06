import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { type Profile } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';

import * as session from './session';

interface AuthState {
  user: Profile | null;
  /** `true` while the session is being restored from the refresh cookie.
   *  Without it, the app would flicker the login at someone already signed in. */
  isLoading: boolean;
  /**
   * Whether this screen is drawn as an administrator's.
   *
   * It is the EFFECTIVE value, not the role: an admin who turned on the user
   * view has it `false`. Everything that decides what to show reads it —the
   * rail, the account sheet, `RequireAdmin`— and that is why the view works
   * without any of them knowing it exists.
   */
  isAdmin: boolean;
  /** The real role. Only for what has to survive the view. */
  isRealAdmin: boolean;
  isViewingAsUser: boolean;
  /**
   * Turns the user view on or off.
   *
   * ── What it is and what it is NOT ───────────────────────────────────────
   * It is a way to SEE the app the way someone who administers nothing sees
   * it: without the Administration group in the rail, without the badge in My
   * account, with the administration screens closed. It is for reviewing what
   * someone whose account was just approved gets.
   *
   * It is NOT a change of permissions. The token that travels is still an
   * administrator's and the API keeps answering it as one: what changes is
   * what this screen offers, not what the server allows. The one that really
   * decides is the `RolesGuard`, as always.
   *
   * Nor is it signing in as SOMEONE ELSE: there is no second session and no
   * other user. It is the same account, with the same movements, without the
   * panel.
   */
  setViewAsUser: (value: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ pendingApproval: boolean; message: string }>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * A thin React layer over `session.ts`.
 *
 * The session logic lives outside React because the API client needs it
 * without being inside a component. This only subscribes to the changes with
 * `useSyncExternalStore`, which is the right way to read an external state
 * without falling out of sync during React 19's concurrent rendering.
 *
 * E-mail and password only. No external providers: authentication is our own
 * from end to end.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(session.subscribe, session.currentState);

  /*
    ── The user view lives in memory, and is forgotten on reload ─────────────
    Like the shortcuts, and for the same reason: it is state of THIS tab and of
    this moment, not a preference. Saving it would also carry a risk of its own
    —an administrator who turns it on, closes and comes back three days later
    finds the app without the panel and without remembering why—, and the way
    out of that mess would be exactly the one it does not occur to them to
    look for.

    Reloading turns it off. It is the safety net of a mode that takes things
    off the screen: it can never stay on in a way nobody knows how to leave.
  */
  const [isViewingAsUser, setIsViewingAsUser] = useState(false);
  const isRealAdmin = state.user?.role === 'admin';

  /*
    Ceasing to be an admin turns it off on its own.

    It happens on signing out and back in with another account, and on
    removing the role from oneself. Without this it would stay on for someone
    who no longer has anywhere to turn it off: the switch is only shown to an
    administrator.
  */
  useOnChange([isRealAdmin], () => {
    if (!isRealAdmin) setIsViewingAsUser(false);
  });

  useEffect(() => {
    // A single attempt on startup: if there is a live refresh cookie, the
    // session comes back on its own; if not, `isLoading` turns false and the
    // login shows.
    void session.restore();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: state.user,
      isLoading: state.isLoading,
      isAdmin: isRealAdmin && !isViewingAsUser,
      isRealAdmin,
      isViewingAsUser,
      setViewAsUser: setIsViewingAsUser,
      signIn: session.signIn,
      signUp: session.signUp,
      signOut: session.signOut,
      signOutEverywhere: session.signOutEverywhere,
      changePassword: session.changePassword,
    }),
    [state, isRealAdmin, isViewingAsUser],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const context = use(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}

/**
 * A readable message for a session error.
 *
 * The messages come from the server already in Spanish and already written
 * not to reveal too much —"wrong e-mail or password" is identical whether or
 * not the account exists—. This only covers the case of no useful response.
 */
export function authErrorMessage(error: unknown): string {
  if (error instanceof session.SessionError) return error.message;
  if (error instanceof TypeError) {
    return t('errors.offlineRetry');
  }
  return t('errors.operationFailedRetry');
}

/** Per-field details of a validation error (e.g. the password policy). */
export function errorDetails(error: unknown): string[] {
  if (error instanceof session.SessionError) {
    return error.details.map((detail) => detail.message);
  }
  return [];
}
