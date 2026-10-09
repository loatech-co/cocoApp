import { Navigate, createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom';

import { RequireAdmin, RequireAuth } from '@/features/auth/components/require-auth';
import { DashboardPage } from '@/features/transactions/pages/dashboard-page';
import { t } from '@/shared/lib/i18n';
import { PAGE_TITLE } from '@/shared/ui/atoms/page-header';

import { AppShell } from './app-shell';
import { ErrorScreen } from './error-screen';

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
  costCenters: async () => ({
    Component: (await import('@/features/cost-centers/pages/cost-centers-page')).CostCentersPage,
  }),
  account: async () => ({
    Component: (await import('@/features/profile/pages/account-page')).AccountPage,
  }),
  register: async () => ({
    Component: (await import('@/features/auth/pages/register-page')).RegisterPage,
  }),
  users: async () => {
    const { UsersPage } = await import('@/features/admin/pages/users-page');
    return {
      element: (
        <RequireAdmin>
          <UsersPage />
        </RequireAdmin>
      ),
    };
  },
  auditLog: async () => {
    const { AuditLogPage } = await import('@/features/admin/pages/audit-log-page');
    return {
      element: (
        <RequireAdmin>
          <AuditLogPage />
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
 * nunca pasó por ahí: vive en `features/transactions/api/read-receipt.ts` y sigue
 * intacto.
 */
export const routes: RouteObject[] = [
  {
    /*
      Every route hangs from this one, which has no path and no element: it is
      only there for its `errorElement`. Whatever breaks below —a screen that
      throws, a chunk a deploy has removed— draws Coco's error screen, in
      Spanish, instead of React Router's default page.
    */
    errorElement: <ErrorScreen />,
    children: [
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
          { path: 'centros-de-costos', lazy: lazily.costCenters },
          // La ruta vieja sigue viva y redirige: hay enlaces guardados y marcadores
          // apuntando a /categorias, y romperlos por un cambio de nombre es gratis
          // de evitar.
          { path: 'categorias', element: <Navigate to="/centros-de-costos" replace /> },
          { path: 'mi-cuenta', lazy: lazily.account },

          // Administración. El RequireAdmin es comodidad de navegación; quien
          // decide de verdad es el RolesGuard del backend.
          { path: 'administracion', lazy: lazily.users },
          { path: 'administracion/bitacora', lazy: lazily.auditLog },
        ],
      },
      {
        path: '*',
        element: (
          <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
            <h1 className={PAGE_TITLE}>{t('shell.notFound.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('shell.notFound.help')}</p>
            <a className="text-primary underline underline-offset-4" href="/">
              {t('common.goHome')}
            </a>
          </main>
        ),
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
