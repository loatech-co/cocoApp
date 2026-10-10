import { Navigate, useLocation, type RouteObject } from 'react-router-dom';

import { currentAccountHash } from '@/features/profile/model/account-sections';

/**
 * The Spanish addresses the web had until 7.2-r1, and where each one lives now.
 *
 * They stay alive as redirects because there are bookmarks and pasted links
 * pointing at them, and not breaking those over a rename is free. They go in
 * the contraction (plan 8.7).
 *
 * `/entrar` is not here: it has had no screen of its own since the login is
 * drawn by `RequireAuth` wherever it is asked for, and it redirects to `/`.
 * `/categorias` is older still: it was renamed to the cost centers before.
 */
export const LEGACY_ROUTES: readonly { from: string; to: string }[] = [
  { from: '/registro', to: '/sign-up' },
  { from: '/cuentas', to: '/accounts' },
  { from: '/centros-de-costos', to: '/cost-centers' },
  { from: '/categorias', to: '/cost-centers' },
  { from: '/mi-cuenta', to: '/account' },
  { from: '/administracion', to: '/admin' },
  { from: '/administracion/bitacora', to: '/admin/audit-log' },
];

/**
 * A `<Navigate replace>` that keeps the query string and the hash.
 *
 * A bare `<Navigate to>` drops both, and they are what a saved link carries:
 * the filters of a cut, or the `#security` section of the account. An old
 * account anchor (`#seguridad`) arrives already translated.
 */
function RedirectKeepingQuery({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash: currentAccountHash(hash) }} replace />;
}

/** The redirects as routes. They hang from the root, before any session check. */
export const legacyRoutes: RouteObject[] = LEGACY_ROUTES.map(({ from, to }) => ({
  path: from,
  element: <RedirectKeepingQuery to={to} />,
}));
