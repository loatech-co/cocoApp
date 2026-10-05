import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { useAlCambiar } from '@/lib/al-cambiar';
import type { PerfilPublico } from '@coco/types';

import * as sesion from './session';

interface AuthState {
  usuario: PerfilPublico | null;
  /** `true` mientras se intenta restaurar la sesión desde la cookie de refresh.
   *  Sin esto, la app parpadearía mostrando el login a alguien ya autenticado. */
  cargando: boolean;
  /**
   * Si esta pantalla se dibuja como la de un administrador.
   *
   * Es el EFECTIVO, no el rol: un admin que encendió la vista de usuario lo
   * tiene en `false`. Lo lee todo el que decide qué enseñar —el riel, la hoja
   * de la cuenta, `RequireAdmin`— y por eso la vista funciona sin que ninguno
   * de ellos sepa que existe.
   */
  esAdmin: boolean;
  /** El rol de verdad. Solo para lo que tiene que sobrevivir a la vista. */
  esAdminDeVerdad: boolean;
  viendoComoUsuario: boolean;
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
  verComoUsuario: (valor: boolean) => void;
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
  const [viendoComoUsuario, setViendoComoUsuario] = useState(false);
  const esAdminDeVerdad = estado.usuario?.role === 'admin';

  /*
    Dejar de ser admin la apaga sola.

    Pasa al cerrar sesión y volver a entrar con otra cuenta, y al quitarse el
    rol a uno mismo. Sin esto quedaría encendida para alguien que ya no tiene
    dónde apagarla: el interruptor solo se le enseña a un administrador.
  */
  useAlCambiar([esAdminDeVerdad], () => {
    if (!esAdminDeVerdad) setViendoComoUsuario(false);
  });

  useEffect(() => {
    // Un único intento al arrancar: si hay cookie de refresh viva, la sesión
    // vuelve sola; si no, `cargando` pasa a false y se muestra el login.
    void sesion.restaurar();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      usuario: estado.usuario,
      cargando: estado.cargando,
      esAdmin: esAdminDeVerdad && !viendoComoUsuario,
      esAdminDeVerdad,
      viendoComoUsuario,
      verComoUsuario: setViendoComoUsuario,
      entrar: sesion.entrar,
      registrarse: sesion.registrarse,
      salir: sesion.salir,
      salirDeTodosLosDispositivos: sesion.salirDeTodosLosDispositivos,
      cambiarContrasena: sesion.cambiarContrasena,
    }),
    [estado, esAdminDeVerdad, viendoComoUsuario],
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
