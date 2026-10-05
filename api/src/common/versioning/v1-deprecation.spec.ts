import type { NextFunction, Request, Response } from 'express';

import { routeTemplate, successorOf, v1Deprecation, V1_DEPRECATION } from './v1-deprecation';

function run(url: string): { headers: Record<string, string>; logged: Record<string, unknown>[] } {
  const headers: Record<string, string> = {};
  const logged: Record<string, unknown>[] = [];
  const next: NextFunction = jest.fn();
  v1Deprecation((entry) => logged.push(entry))(
    { originalUrl: url, method: 'GET' } as Request,
    {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response,
    next,
  );
  expect(next).toHaveBeenCalled();
  return { headers, logged };
}

describe('v1 deprecation', () => {
  it('is the day v2 shipped, as an RFC 9745 date', () => {
    expect(V1_DEPRECATION).toBe('@1791158400');
  });

  it('points every v1 route at its v2 successor, renamed segments included', () => {
    expect(successorOf('/api/v1/transactions')).toBe('/api/v2/transactions');
    expect(successorOf('/api/v1/transactions/historia')).toBe('/api/v2/transactions/history');
    expect(successorOf('/api/v1/transactions/7/soportes/9')).toBe(
      '/api/v2/transactions/7/receipts/9',
    );
    expect(successorOf('/api/v1/categories/3/usos')).toBe('/api/v2/categories/3/usage');
    expect(successorOf('/api/v1/categories/3/unificar')).toBe('/api/v2/categories/3/merge');
  });

  it('logs the route template, never an id or the query', () => {
    expect(routeTemplate('/api/v1/transactions/123/soportes/45')).toBe(
      '/api/v1/transactions/:id/soportes/:id',
    );

    const { headers, logged } = run('/api/v1/transactions/123?q=farmacia');
    expect(headers).toEqual({
      Deprecation: V1_DEPRECATION,
      Link: '</api/v2/transactions/123>; rel="successor-version"',
    });
    expect(logged).toEqual([
      { context: 'deprecation', msg: 'v1_used', method: 'GET', route: '/api/v1/transactions/:id' },
    ]);
    expect(JSON.stringify(logged)).not.toContain('farmacia');
  });

  it('leaves v2 and everything else alone', () => {
    for (const url of ['/api/v2/transactions', '/api/v10/x', '/', '/api/docs']) {
      expect(run(url)).toEqual({ headers: {}, logged: [] });
    }
  });
});
