// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryRouter,
  useLocation,
  type RouteObject,
} from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { LEGACY_ROUTES, legacyRoutes } from './legacy-routes';
import { routes } from './router';

afterEach(cleanup);

function WhereAmI() {
  const { pathname, search, hash } = useLocation();
  return <output>{`${pathname}${search}${hash}`}</output>;
}

function renderAt(url: string) {
  const router = createMemoryRouter([...legacyRoutes, { path: '*', element: <WhereAmI /> }], {
    initialEntries: [url],
  });
  render(<RouterProvider router={router} />);
  return router;
}

/** Every path the app answers, written whole: `/admin/audit-log`, not `admin/audit-log`. */
function pathsOf(list: RouteObject[], parent = ''): string[] {
  return list.flatMap((r) => {
    const own =
      r.path === undefined ? parent : r.path.startsWith('/') ? r.path : `${parent}/${r.path}`;
    const clean = own.replace(/\/+/g, '/');
    return [...(r.path === undefined ? [] : [clean]), ...pathsOf(r.children ?? [], clean)];
  });
}

describe('the Spanish routes from before 7.2-r1', () => {
  it.each(LEGACY_ROUTES.map(({ from, to }) => [from, to]))(
    '%s redirects to %s keeping the query and the hash',
    async (from, to) => {
      const router = renderAt(`${from}?range=last-month&q=luz#security`);

      expect(await screen.findByText(`${to}?range=last-month&q=luz#security`)).toBeTruthy();
      // `replace`: the old address does not stay in the history.
      expect(router.state.historyAction).toBe('REPLACE');
    },
  );

  it('redirects without a query or a hash too', async () => {
    renderAt('/mi-cuenta');

    expect(await screen.findByText('/account')).toBeTruthy();
  });

  it('points every redirect at a route that exists', () => {
    const paths = pathsOf(routes);

    for (const { from, to } of LEGACY_ROUTES) {
      expect(paths).toContain(from);
      expect(paths).toContain(to);
    }
  });
});
