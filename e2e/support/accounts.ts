import { expect, request, type APIRequestContext } from '@playwright/test';

import { BASE_URL } from './entorno.mjs';

/**
 * Registering and logging in through the API, shared by the fixtures and by
 * `global-setup.ts`. Accounts live in the fake GoTrue of `servidor.mjs`; the
 * password below is only valid there.
 */

export const ADMIN_EMAIL = 'admin@recorridos.coco';
export const PASSWORD = 'Xk9$Ronda-Verde!';

interface Envelope<T> {
  data: T;
}

export async function readData<T>(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
): Promise<T> {
  expect(response.ok(), `${response.url()} → ${response.status()}`).toBeTruthy();
  return ((await response.json()) as Envelope<T>).data;
}

export async function login(email: string): Promise<APIRequestContext> {
  const anonymous = await request.newContext({ baseURL: BASE_URL });
  const { accessToken } = await readData<{ accessToken: string }>(
    await anonymous.post('/api/v2/auth/login', { data: { email, password: PASSWORD } }),
  );
  await anonymous.dispose();
  return request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function register(email: string, displayName: string): Promise<void> {
  const anonymous = await request.newContext({ baseURL: BASE_URL });
  const response = await anonymous.post('/api/v2/auth/register', {
    data: { email, password: PASSWORD, displayName },
  });
  await anonymous.dispose();
  // An e-mail that already exists also answers 2xx («pending»): the API does
  // not reveal which e-mails have an account. So a second register of the
  // same e-mail cannot be told apart from the first one here.
  if (!response.ok()) {
    throw new Error(`register ${email} → ${response.status()} ${await response.text()}`);
  }
}
