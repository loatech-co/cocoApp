import type { PerfilPublico } from '@coco/types';
import { createContext, use, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import * as sesion from './session';

interface AuthState {
  usuario: PerfilPublico | null;
  /** `true` mientras se intenta restaurar la sesión desde la cookie de refresh.
   *  Sin esto, la app parpadearía mostrando el login a alguien ya autenticado. */
  cargando: boolean;
  esAdmin: boolean;
  entrar: (email: string, password: string) => Promise<void>;
  registrarse: (
    email: string,
    password: string,
    nombre: string,
  ) => Promise<{ pending_approval: boolean; message: string }>;
  salir: () => Promise<void>;
  salirDeTodosLosDispositivos: () => Promise<void>;
  cambiarContrasena: (actual: string, nueva: string) => Promise<void>;
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
  const estado = useSyncExternalStore(sesion.suscribirse, sesion.estadoActual);

  useEffect(() => {
    // Un único intento al arrancar: si hay cookie de refresh viva, la sesión
    // vuelve sola; si no, `cargando` pasa a false y se muestra el login.
    void sesion.restaurar();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      usuario: estado.usuario,
      cargando: estado.cargando,
      esAdmin: estado.usuario?.role === 'admin',
      entrar: sesion.entrar,
      registrarse: sesion.registrarse,
      salir: sesion.salir,
      salirDeTodosLosDispositivos: sesion.salirDeTodosLosDispositivos,
      cambiarContrasena: sesion.cambiarContrasena,
    }),
    [estado],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const context = use(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
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
export function mensajeDeErrorDeAuth(error: unknown): string {
  if (error instanceof sesion.SesionError) return error.message;
  if (error instanceof TypeError) {
    return 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
  }
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

/** Detalles por campo de un error de validación (p. ej. la política de contraseñas). */
export function detallesDeError(error: unknown): string[] {
  if (error instanceof sesion.SesionError) {
    return error.details.map((detalle) => detalle.message);
  }
  return [];
}
