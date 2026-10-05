import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom';

import { RequireAdmin, RequireAuth } from '@/features/auth/components/require-auth';
import { DashboardPage } from '@/features/transactions/pages/dashboard-page';
import { TITULO_DE_PAGINA } from '@/shared/ui/atoms/cabecera-de-pagina';

import { AppShell } from './app-shell';

/*
  Every screen but the first one loads on demand (ADR 0018). The index is the
  dashboard, and the login is drawn by `RequireAuth` in its place: those two
  are the first paint and stay in the entry chunk. The rest —accounts, cost
  centers, the user's account, registration, administration— arrive as their
  own chunk the first time someone navigates there.
*/
const lazily = {
  accounts: async () => ({
    Component: (await import('@/features/bank-accounts/pages/accounts-page')).AccountsPage,
  }),
  centros: async () => ({
    Component: (await import('@/features/centros/pages/centros-page')).CentrosPage,
  }),
  cuenta: async () => ({
    Component: (await import('@/features/profile/pages/cuenta-page')).CuentaPage,
  }),
  register: async () => ({
    Component: (await import('@/features/auth/pages/register-page')).RegisterPage,
  }),
  usuarios: async () => {
    const { UsuariosPage } = await import('@/features/admin/pages/usuarios-page');
    return {
      element: (
        <RequireAdmin>
          <UsuariosPage />
        </RequireAdmin>
      ),
    };
  },
  bitacora: async () => {
    const { BitacoraPage } = await import('@/features/admin/pages/bitacora-page');
    return {
      element: (
        <RequireAdmin>
          <BitacoraPage />
        </RequireAdmin>
      ),
    };
  },
};

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
  { path: '/registro', lazy: lazily.register },
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
      { path: 'cuentas', lazy: lazily.accounts },
      { path: 'centros-de-costos', lazy: lazily.centros },
      // La ruta vieja sigue viva y redirige: hay enlaces guardados y marcadores
      // apuntando a /categorias, y romperlos por un cambio de nombre es gratis
      // de evitar.
      { path: 'categorias', element: <Navigate to="/centros-de-costos" replace /> },
      { path: 'mi-cuenta', lazy: lazily.cuenta },

      // Administración. El RequireAdmin es comodidad de navegación; quien
      // decide de verdad es el RolesGuard del backend.
      { path: 'administracion', lazy: lazily.usuarios },
      { path: 'administracion/bitacora', lazy: lazily.bitacora },
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
