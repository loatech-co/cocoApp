import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

/**
 * Guardia de rutas del cliente.
 *
 * Es comodidad de navegación, NO seguridad: quien manda es el JwtAuthGuard del
 * backend, que verifica el token y consulta la base en cada petición. Aunque
 * alguien forzara la ruta, la API no le devolvería un solo dato.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

  if (cargando) {
    return <Esperando />;
  }

  if (!usuario) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/**
 * Guardia de las rutas de administración.
 *
 * Igual que arriba: el RolesGuard del backend es el que decide de verdad. Esto
 * solo evita mostrar una pantalla que la API va a rechazar. El rol se lee del
 * perfil que devuelve el servidor, nunca de algo que el cliente pueda alterar.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { usuario, cargando, esAdmin } = useAuth();
  const location = useLocation();

  if (cargando) {
    return <Esperando />;
  }

  if (!usuario) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }

  if (!esAdmin) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Alert variant="destructive">
          <AlertTitle>No tienes acceso a esta sección</AlertTitle>
          <AlertDescription>
            La administración está reservada a las cuentas con rol de administrador.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <a href="/">Volver al inicio</a>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

function Esperando() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Verificando la sesión…</span>
    </div>
  );
}
