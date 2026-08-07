import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from './firebase';

interface AuthState {
  user: User | null;
  /** `true` mientras Firebase resuelve si ya había sesión. Sin esto, la app
   *  parpadearía mostrando el login a alguien que sí estaba autenticado. */
  cargando: boolean;
  entrarConGoogle: () => Promise<void>;
  entrarConCorreo: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (siguiente) => {
      setUser(siguiente);
      setCargando(false);
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      cargando,
      entrarConGoogle: async () => {
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      entrarConCorreo: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      salir: async () => {
        await signOut(auth);
      },
    }),
    [user, cargando],
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

/** Traduce los códigos de Firebase a mensajes en español, sin filtrar detalle
 *  técnico ni revelar si un correo existe. */
export function mensajeDeErrorDeAuth(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';

  switch (code) {
    case 'auth/invalid-email':
      return 'El correo no tiene un formato válido.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Cerraste la ventana antes de terminar.';
    case 'auth/network-request-failed':
      return 'No hay conexión. Revisa tu red e inténtalo de nuevo.';
    default:
      return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  }
}
