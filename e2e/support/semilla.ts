import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Seeds a journey's own user through the public API, never through SQL: the
 * journeys depend on the contract, not on the shape of the tables.
 *
 * A new user already has the default structure (two cost centres with their
 * categories); the seed only adds what a journey needs on top. Amounts are
 * made-up round numbers.
 */

interface Node {
  id: number;
  name: string;
  children: Node[];
}

async function data<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), `${response.url()} → ${response.status()} ${await response.text()}`).toBe(
    true,
  );
  return ((await response.json()) as { data: T }).data;
}

/** The id of a category by its path, e.g. `['Costos fijos', 'Vivienda']`. */
async function categoryId(api: APIRequestContext, path: string[]): Promise<number> {
  let level = await data<Node[]>(await api.get('/api/v1/categories'));
  let found: Node | undefined;
  for (const name of path) {
    found = level.find((n) => n.name === name);
    if (!found) throw new Error(`No category "${name}" in ${path.join(' › ')}`);
    level = found.children;
  }
  if (!found) throw new Error('Empty path');
  return found.id;
}

export interface ConceptOptions {
  palabras_clave?: string[];
  recurrente?: boolean;
  periodicidad?: 'mensual';
  dia_de_pago?: number;
  presupuesto?: number;
  varios_pagos?: boolean;
}

/** Creates a concept under `[centre, category]` and returns its id. */
export async function createConcept(
  api: APIRequestContext,
  under: [string, string],
  name: string,
  options: ConceptOptions = {},
): Promise<number> {
  const parent_id = await categoryId(api, under);
  const created = await data<{ id: number }>(
    await api.post('/api/v1/categories', {
      data: { name, kind: 'expense', parent_id, ...options },
    }),
  );
  return created.id;
}

/** Today in Bogotá, as `YYYY-MM-DD`: the day the app opens on. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/** Registers an expense of `amount` (whole pesos) in a concept, today. */
export async function createExpense(
  api: APIRequestContext,
  category_id: number,
  amount: number,
): Promise<number> {
  const created = await data<{ id: number }>(
    await api.post('/api/v1/transactions', {
      data: { category_id, amount: String(amount), date: today(), type: 'expense' },
    }),
  );
  return created.id;
}
