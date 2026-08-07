import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

/**
 * Guardia de rutas del cliente.
 *
 * Es solo comodidad de navegación, NO seguridad: quien manda es el AuthGuard
 * del backend, que verifica el token en cada petición. Aunque alguien forzara
 * la ruta, la API no le devolvería un solo dato.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, cargando } = useAuth();
  const location = useLocation();

  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Verificando la sesión…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
