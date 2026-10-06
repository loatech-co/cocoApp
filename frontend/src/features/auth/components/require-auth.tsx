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
 * Sin sesión: el login, y la barra de direcciones en el índice.
 *
 * ── Por qué ya no hay una ruta a la que ir ──────────────────────────────────
 * La había —`/entrar`— y el precio era que cerrar sesión dejaba esa dirección
 * puesta. Quedaba una URL interna a la vista, en la pantalla que más gente
 * distinta ve, diciendo por dónde se entra a una aplicación privada. Y no
 * aporta nada: quien cierra sesión no eligió ir a ninguna parte.
 *
 * Ahora el login se DIBUJA en el sitio donde se estaba pidiendo entrar, y la
 * dirección es siempre `/`. Una sola URL pública, la más corta, y nada que
 * limpiar después de salir.
 *
 * ── Lo que se pierde, y se acepta ───────────────────────────────────────────
 * Volver después de entrar a la página que se había pedido. Se llevaba en el
 * estado de la navegación a `/entrar`, y sin esa navegación no hay dónde
 * llevarlo: al dibujarse en el sitio, el login se desmonta en el mismo render
 * en que aparece la sesión, así que nunca llega a navegar a ningún lado.
 *
 * A cambio, quien entra aterriza siempre en el resumen, que es de donde se
 * parte para todo lo demás.
 */
function SinSesion({ enElIndice }: { enElIndice: boolean }) {
  // Dentro de la app no existe el login web: la sesión la tiene la app y es
  // ella quien la empuja. Nada de `LoginPage`, y nada de `Navigate`: la ruta
  // se queda donde la app la puso, para que al llegar la sesión se pinte esa
  // página y no el resumen.
  if (isInNativeApp()) return <SesionDesdeLaApp />;

  // En cualquier otra ruta se vuelve al índice primero: si no, la barra de
  // direcciones se queda en una página que ya no se está viendo —el login
  // encima de `/administracion`—, que es exactamente lo que se venía a quitar.
  return enElIndice ? <LoginPage /> : <Navigate to="/" replace />;
}

/**
 * La web embebida está sin sesión: se lo dice a la app y espera.
 *
 * Se avisa UNA vez por montaje, no en cada render: la app responde empujando
 * una sesión si la tiene, y un aviso por render sería un sondeo. Lo que la
 * app hace con el aviso es cosa suya —si no tiene sesión, muestra su propio
 * login nativo por encima—; esta pantalla solo espera.
 */
function SesionDesdeLaApp() {
  useEffect(() => {
    notifyApp({ tipo: 'sinSesion' });
  }, []);

  return <Esperando texto={t('auth.guard.openingFromApp')} />;
}

/**
 * Guardia de rutas del cliente.
 *
 * Es comodidad de navegación, NO seguridad: quien manda es el JwtAuthGuard del
 * backend, que verifica el token y consulta la base en cada petición. Aunque
 * alguien forzara la ruta, la API no le devolvería un solo dato.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Esperando />;
  }

  if (!user) {
    return <SinSesion enElIndice={location.pathname === '/'} />;
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
  const { user, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Esperando />;
  }

  if (!user) {
    return <SinSesion enElIndice={location.pathname === '/'} />;
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

function Esperando({ texto = t('auth.guard.verifying') }: { texto?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{texto}</span>
    </div>
  );
}
