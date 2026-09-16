import { Navigate, createBrowserRouter, RouterProvider, useParams } from 'react-router-dom';

import { AppShell } from '@/app/app-shell';
import { AccountsPage } from '@/features/accounts/accounts-page';
import { BitacoraPage } from '@/features/admin/bitacora-page';
import { UsuariosPage } from '@/features/admin/usuarios-page';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { RequireAdmin, RequireAuth } from '@/features/auth/require-auth';
import { CentrosPage } from '@/features/centros/centros-page';
import { CuentaPage } from '@/features/cuenta/cuenta-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { ImportarPage } from '@/features/imports/importar-page';
import { RevisarPage } from '@/features/imports/revisar-page';

/**
 * Rutas en español, una por módulo del catálogo.
 *
 * Por ahora solo existen las de la Fase 1 más las de auth y administración.
 * Importar, Presupuestos, Fijos, Deudas, Metas y Reportes se añaden en su fase,
 * cada una como un `feature` propio bajo `src/features/`.
 */
const router = createBrowserRouter([
  { path: '/entrar', element: <LoginPage /> },
  { path: '/registro', element: <RegisterPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'cuentas', element: <AccountsPage /> },
      { path: 'centros-de-costos', element: <CentrosPage /> },
      // La ruta vieja sigue viva y redirige: hay enlaces guardados y marcadores
      // apuntando a /categorias, y romperlos por un cambio de nombre es gratis
      // de evitar.
      { path: 'categorias', element: <Navigate to="/centros-de-costos" replace /> },
      { path: 'escanear', element: <ImportarPage /> },
      { path: 'escanear/:id', element: <RevisarPage /> },
      // La ruta vieja sigue viva y redirige: un enlace guardado o el historial
      // del navegador no tienen por qué romperse porque la sección cambió de
      // nombre.
      { path: 'importar', element: <Navigate to="/escanear" replace /> },
      { path: 'importar/:id', element: <RedirigirEscaneo /> },
      { path: 'mi-cuenta', element: <CuentaPage /> },

      // Administración. El RequireAdmin es comodidad de navegación; quien
      // decide de verdad es el RolesGuard del backend.
      {
        path: 'administracion',
        element: (
          <RequireAdmin>
            <UsuariosPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'administracion/bitacora',
        element: (
          <RequireAdmin>
            <BitacoraPage />
          </RequireAdmin>
        ),
      },
    ],
  },
  {
    path: '*',
    element: (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-3xl font-semibold">Esta página no existe</h1>
        <p className="text-muted-foreground">Revisa la dirección o vuelve al inicio.</p>
        <a className="text-primary underline underline-offset-4" href="/">
          Ir al inicio
        </a>
      </main>
    ),
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

/**
 * La ruta vieja de un escaneo concreto, con su identificador.
 *
 * Existe porque la sección cambió de nombre y un enlace guardado —o el botón
 * de atrás del navegador— no tiene por qué romperse por eso.
 */
function RedirigirEscaneo() {
  const { id } = useParams();
  return <Navigate to={`/escanear/${id ?? ''}`} replace />;
}
