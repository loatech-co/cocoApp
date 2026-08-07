import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AppShell } from '@/app/app-shell';
import { AccountsPage } from '@/features/accounts/accounts-page';
import { LoginPage } from '@/features/auth/login-page';
import { RequireAuth } from '@/features/auth/require-auth';
import { CategoriesPage } from '@/features/categories/categories-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { TransactionsPage } from '@/features/transactions/transactions-page';

/**
 * Rutas en español, una por módulo del catálogo.
 *
 * Por ahora solo existen las de la Fase 1. Importar, Presupuestos, Fijos,
 * Deudas, Metas y Reportes se añaden en su fase, cada una como un `feature`
 * propio bajo `src/features/`.
 */
const router = createBrowserRouter([
  {
    path: '/entrar',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'movimientos', element: <TransactionsPage /> },
      { path: 'cuentas', element: <AccountsPage /> },
      { path: 'categorias', element: <CategoriesPage /> },
    ],
  },
  {
    path: '*',
    element: (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="font-serif text-3xl font-semibold">Esta página no existe</h1>
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
