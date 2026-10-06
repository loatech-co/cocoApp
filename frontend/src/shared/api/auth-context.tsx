import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { type Profile } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';

import * as session from './session';

interface AuthState {
  user: Profile | null;
  /** `true` mientras se intenta restaurar la sesión desde la cookie de refresh.
   *  Sin esto, la app parpadearía mostrando el login a alguien ya autenticado. */
  isLoading: boolean;
  /**
   * Si esta pantalla se dibuja como la de un administrador.
   *
   * Es el EFECTIVO, no el rol: un admin que encendió la vista de usuario lo
   * tiene en `false`. Lo lee todo el que decide qué enseñar —el riel, la hoja
   * de la cuenta, `RequireAdmin`— y por eso la vista funciona sin que ninguno
   * de ellos sepa que existe.
   */
  isAdmin: boolean;
  /** El rol de verdad. Solo para lo que tiene que sobrevivir a la vista. */
  isRealAdmin: boolean;
  isViewingAsUser: boolean;
  /**
   * Enciende o apaga la vista de usuario.
   *
   * ── Qué es y qué NO es ──────────────────────────────────────────────────
   * Es una forma de VER la aplicación como la ve quien no administra nada:
   * sin el grupo de Administración en el riel, sin la insignia en Mi cuenta,
   * con las pantallas de administración cerradas. Sirve para revisar lo que
   * recibe alguien a quien se acaba de aprobar la cuenta.
   *
   * NO es un cambio de permisos. El token que viaja sigue siendo el de un
   * administrador y la API le sigue contestando como a tal: lo que cambia es
   * lo que esta pantalla ofrece, no lo que el servidor permite. Quien decide
   * de verdad es el `RolesGuard`, como siempre.
   *
   * Tampoco es entrar como OTRA persona: no hay segunda sesión ni otro
   * usuario. Es la misma cuenta, con sus mismos movimientos, sin el panel.
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
 * Capa fina de React sobre `session.ts`.
 *
 * La lógica de sesión vive fuera de React porque el cliente de API la necesita
 * sin estar dentro de un componente. Aquí solo se suscribe a los cambios con
 * `useSyncExternalStore`, que es la forma correcta de leer un estado externo
 * sin desincronizarse durante el renderizado concurrente de React 19.
 *
 * Solo correo y contraseña. Sin proveedores externos: la autenticación es
 * propia de punta a punta.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(session.subscribe, session.currentState);

  /*
    ── La vista de usuario vive en memoria, y se olvida al recargar ──────────
    Como los atajos, y por el mismo motivo: es estado de ESTA pestaña y de este
    momento, no una preferencia. Guardarla tendría además un riesgo propio —un
    administrador que la enciende, cierra y vuelve dentro de tres días se
    encuentra la aplicación sin panel y sin recordar por qué—, y la salida de
    ese lío sería justo la que no se le ocurre buscar.

    Recargar la apaga. Es la red de seguridad de un modo que quita cosas de la
    pantalla: nunca se puede quedar encendido de una forma de la que no se sepa
    salir.
  */
  const [isViewingAsUser, setIsViewingAsUser] = useState(false);
  const isRealAdmin = state.user?.role === 'admin';

  /*
    Dejar de ser admin la apaga sola.

    Pasa al cerrar sesión y volver a entrar con otra cuenta, y al quitarse el
    rol a uno mismo. Sin esto quedaría encendida para alguien que ya no tiene
    dónde apagarla: el interruptor solo se le enseña a un administrador.
  */
  useOnChange([isRealAdmin], () => {
    if (!isRealAdmin) setIsViewingAsUser(false);
  });

  useEffect(() => {
    // Un único intento al arrancar: si hay cookie de refresh viva, la sesión
    // vuelve sola; si no, `cargando` pasa a false y se muestra el login.
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
 * Mensaje legible para un error de sesión.
 *
 * Los mensajes vienen del servidor ya en español y ya pensados para no revelar
 * de más —"correo o contraseña incorrectos" es idéntico exista o no la cuenta—.
 * Aquí solo se cubre el caso de que no haya respuesta útil.
 */
export function authErrorMessage(error: unknown): string {
  if (error instanceof session.SessionError) return error.message;
  if (error instanceof TypeError) {
    return t('errors.offlineRetry');
  }
  return t('errors.operationFailedRetry');
}

/** Detalles por campo de un error de validación (p. ej. la política de contraseñas). */
export function errorDetails(error: unknown): string[] {
  if (error instanceof session.SessionError) {
    return error.details.map((detail) => detail.message);
  }
  return [];
}
