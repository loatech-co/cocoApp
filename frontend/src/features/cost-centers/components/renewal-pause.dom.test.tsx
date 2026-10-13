// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PausedCharge, RecurrencePause } from '@/shared/api/generated/model';

import { RenewalPause } from './renewal-pause';

/*
  The network, faked at `apiRequest`: the generated client calls it with the
  full v2 path and a JSON string, and `server` answers like the API would.
*/
const calls: { method: string; path: string; body?: unknown }[] = [];
const server = {
  pauses: [] as RecurrencePause[],
  charges: [] as PausedCharge[],
};

function answer(method: string, path: string, body?: unknown): unknown {
  if (method === 'GET' && /\/pauses\/\d+\/charges/.test(path)) {
    return { data: server.charges, meta: { page: 1, perPage: 200, total: server.charges.length } };
  }
  if (method === 'GET') {
    return { data: server.pauses, meta: { page: 1, perPage: 200, total: server.pauses.length } };
  }
  if (method === 'POST' && path.endsWith('/discard')) {
    return { data: { deleted: (body as { transactionIds: number[] }).transactionIds.length } };
  }
  if (method === 'POST') {
    const pause = { id: 9, categoryId: 7, resumeMonth: null, ...(body as object) };
    server.pauses = [pause as RecurrencePause, ...server.pauses];
    return { data: pause };
  }
  if (method === 'PATCH') return { data: { ...server.pauses[0], ...(body as object) } };
  return undefined;
}

vi.mock('@/shared/api/api-client', async () => {
  const real =
    await vi.importActual<typeof import('@/shared/api/api-client')>('@/shared/api/api-client');
  return {
    ...real,
    apiRequest: (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.replace(/^\/api\/v2/, '').replace(/\?.*$/, '');
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ method, path, body });
      return Promise.resolve(answer(method, path, body));
    },
  };
});

// Today, fixed: the month the questions start on.
vi.mock('@/shared/lib/format', async () => {
  const real = await vi.importActual<typeof import('@/shared/lib/format')>('@/shared/lib/format');
  return { ...real, todayInBogota: () => '2026-10-13' };
});

function renderPause() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RenewalPause conceptId={7} />
    </QueryClientProvider>,
  );
}

const sent = (method: string, suffix: string) =>
  calls.filter((c) => c.method === method && c.path.endsWith(suffix));

beforeEach(() => {
  calls.length = 0;
  server.pauses = [];
  server.charges = [];
});

afterEach(cleanup);

describe('RenewalPause', () => {
  it('pauses from the chosen month and, when charges were already written, deletes them only on confirmation', async () => {
    server.charges = [{ id: 501, month: '2026-10', date: '2026-10-01', conceptName: 'Streaming' }];
    renderPause();

    expect(await screen.findByText('Se renueva según su periodicidad.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar renovación' }));
    expect(screen.getByRole('group', { name: '¿Desde qué mes queda en pausa?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Cobros automáticos en meses en pausa',
    });
    expect(sent('POST', '/categories/7/pauses')[0]?.body).toEqual({ fromMonth: '2026-10' });
    expect(dialog.textContent).toContain('Streaming — octubre de 2026');
    // Nothing is deleted before the answer.
    expect(sent('POST', '/discard')).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cobros' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent('POST', '/categories/7/pauses/9/charges/discard')[0]?.body).toEqual({
      transactionIds: [501],
    });
    expect(await screen.findByText('En pausa desde octubre de 2026.')).toBeTruthy();
  });

  it('cancelling the question keeps the charges, and the pause stays', async () => {
    server.charges = [{ id: 501, month: '2026-10', date: '2026-10-01', conceptName: 'Streaming' }];
    renderPause();

    fireEvent.click(await screen.findByRole('button', { name: 'Pausar renovación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent('POST', '/discard')).toEqual([]);
    expect(await screen.findByText('En pausa desde octubre de 2026.')).toBeTruthy();
  });

  it('asks nothing when there was no charge in the paused months', async () => {
    renderPause();

    fireEvent.click(await screen.findByRole('button', { name: 'Pausar renovación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    await waitFor(() => expect(sent('GET', '/charges')).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('resumes an open pause from the month asked, and shows the history', async () => {
    server.pauses = [
      { id: 3, categoryId: 7, fromMonth: '2026-08', resumeMonth: null },
      { id: 2, categoryId: 7, fromMonth: '2026-01', resumeMonth: '2026-03' },
    ];
    renderPause();

    expect(await screen.findByText('En pausa desde agosto de 2026.')).toBeTruthy();
    expect(screen.getByText('De enero de 2026 a febrero de 2026')).toBeTruthy();
    expect(screen.getByText('Desde agosto de 2026, sin fecha de regreso')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reactivar renovación' }));
    expect(screen.getByRole('group', { name: '¿Desde qué mes se reactiva?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));

    await waitFor(() =>
      expect(sent('PATCH', '/categories/7/pauses/3')[0]?.body).toEqual({ resumeMonth: '2026-10' }),
    );
  });

  it('removes a period from the history', async () => {
    server.pauses = [{ id: 2, categoryId: 7, fromMonth: '2026-01', resumeMonth: '2026-03' }];
    renderPause();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Quitar la pausa: De enero de 2026 a febrero de 2026',
      }),
    );

    await waitFor(() => expect(sent('DELETE', '/categories/7/pauses/2')).toHaveLength(1));
  });
});
