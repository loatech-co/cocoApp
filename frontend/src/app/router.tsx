import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AppShell } from '@/app/app-shell';
import { TITULO_DE_PAGINA } from '@/components/cabecera-de-pagina';
import { AccountsPage } from '@/features/accounts/accounts-page';
import { BitacoraPage } from '@/features/admin/bitacora-page';
import { UsuariosPage } from '@/features/admin/usuarios-page';
import { RegisterPage } from '@/features/auth/register-page';
import { RequireAdmin, RequireAuth } from '@/features/auth/require-auth';
import { CentrosPage } from '@/features/centros/centros-page';
import { CuentaPage } from '@/features/cuenta/cuenta-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';

/**
 * Rutas en español, una por módulo del catálogo.
 *
 * Por ahora solo existen las de la Fase 1 más las de auth y administración.
 * Presupuestos, Fijos, Deudas, Metas y Reportes se añaden en su fase, cada una
 * como un `feature` propio bajo `src/features/`.
 *
 * La de escanear extractos SE FUE, y con ella sus redirecciones: era una
 * pantalla para cargar un CSV o un PDF de banco y revisar sus filas antes de
 * guardarlas. Lo que sí se usa —leer UN soporte al registrar un movimiento—
 * nunca pasó por ahí: vive en `features/transactions/leer-soporte.ts` y sigue
 * intacto.
 */
const router = createBrowserRouter([
  /*
    La dirección vieja de entrar. Sigue viva y redirige: hay marcadores y
    enlaces guardados apuntando ahí, y romperlos es gratis de evitar.

    El login ya no vive en una ruta propia: lo dibuja `RequireAuth` en el sitio
    donde se estaba pidiendo entrar, para que la barra de direcciones no se
    quede en `/entrar` después de cerrar sesión.
  */
  { path: '/entrar', element: <Navigate to="/" replace /> },
  { path: '/registro', element: <RegisterPage /> },
  {
    // Dentro de la app del teléfono, `window.__coco` —ir a una ruta, abrir la
    // búsqueda— lo publica `PuenteDeNavegacion`, un hijo del armazón: es el
    // único sitio que llega a la vez al enrutador y a la búsqueda.
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
        <h1 className={TITULO_DE_PAGINA}>Esta página no existe</h1>
        <p className="text-sm text-muted-foreground">Revisa la dirección o vuelve al inicio.</p>
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
