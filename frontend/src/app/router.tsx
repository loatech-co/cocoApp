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
 * Routes in Spanish, one per catalog module.
 *
 * For now only the Phase 1 ones exist, plus auth and admin. Budgets, Fixed,
 * Debts, Goals and Reports are added in their phase, each as its own
 * `feature` under `src/features/`.
 *
 * The statement-scanning one IS GONE, and its redirects with it: it was a
 * screen to load a bank CSV or PDF and review its rows before saving them.
 * What is used —reading ONE receipt when recording a transaction— never went
 * through there: it lives in `features/transactions/api/read-receipt.ts` and
 * is untouched.
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
    The old sign-in address. It is still alive and redirects: there are
    bookmarks and saved links pointing there, and not breaking them is free.

    The login no longer lives on its own route: `RequireAuth` draws it where
    signing in was being asked for, so the address bar does not stay on
    `/entrar` after signing out.
  */
      { path: '/entrar', element: <Navigate to="/" replace /> },
      { path: '/registro', lazy: lazily.register },
      {
        // Inside the phone app, `window.__coco` —go to a route, open the
        // search— is published by `NavigationBridge`, a child of the shell:
        // it is the only place that reaches both the router and the search.
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
          // The old route is still alive and redirects: there are saved links and
          // bookmarks pointing at /categorias, and not breaking them over a
          // rename is free.
          { path: 'categorias', element: <Navigate to="/centros-de-costos" replace /> },
          { path: 'mi-cuenta', lazy: lazily.account },

          // Admin. RequireAdmin is a navigation convenience; what really decides
          // is the backend's RolesGuard.
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
