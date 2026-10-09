import type { INestApplication } from '@nestjs/common';

import type { TestEnvironment } from './app';

/**
 * What `user-isolation.e2e-spec.ts` needs: Ana's data, the snapshot that
 * proves it untouched, and the routes Express actually serves.
 */

/** Everything Ana owns carries this, so a leak shows up in any response body. */
export const MARK = 'ANA-PRIVATE';

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export interface AnaData {
  accountId: bigint;
  centerId: bigint;
  groupId: bigint;
  conceptId: bigint;
  transactionId: bigint;
  transactionRef: string;
  tagId: bigint;
  receiptId: bigint;
  ruleId: bigint;
}

/** Snapshot of every row a user owns, to prove nothing of theirs changed. */
export async function snapshotOf(env: TestEnvironment, userId: bigint): Promise<string> {
  const where = { userId };
  const [accounts, categories, transactions, tags, receipts, rules, preferences] =
    await Promise.all([
      env.prisma.account.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.category.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.transaction.findMany({
        where,
        orderBy: { id: 'asc' },
        include: { tags: true, splits: true },
      }),
      env.prisma.tag.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.receipt.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.categoryRule.findMany({ where, orderBy: { id: 'asc' } }),
      env.prisma.userPreference.findMany({ where, orderBy: { id: 'asc' } }),
    ]);
  return JSON.stringify(
    { accounts, categories, transactions, tags, receipts, rules, preferences },
    (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
  );
}

/** Ana owns one of every user-scoped row, each carrying `MARK`. */
export async function seedAna(env: TestEnvironment, userId: bigint): Promise<AnaData> {
  const p = env.prisma;
  const account = await p.account.create({
    data: { userId, name: `${MARK} cuenta`, type: 'cash' },
  });
  const center = await p.category.create({ data: { userId, name: `${MARK} centro` } });
  const group = await p.category.create({
    data: { userId, name: `${MARK} grupo`, parentId: center.id },
  });
  const concept = await p.category.create({
    data: {
      userId,
      name: `${MARK} concepto`,
      parentId: group.id,
      isRecurring: true,
      periodicity: 'monthly',
      paymentDay: 1,
      budget: '777777',
      isAutoPaid: true,
      keywords: [MARK, 'supermercado'],
    },
  });
  const tag = await p.tag.create({ data: { userId, name: `${MARK}-tag` } });
  const transactionRef = `${MARK}-ref`;
  const transaction = await p.transaction.create({
    data: {
      userId,
      accountId: account.id,
      date: new Date('2020-01-15'),
      period: new Date('2020-01-01'),
      amount: '777777',
      categoryId: concept.id,
      description: `${MARK} gasto`,
      merchant: `${MARK} comercio`,
      externalRef: transactionRef,
      tags: { create: [{ tagId: tag.id }] },
      splits: { create: [{ categoryId: concept.id, amount: '777777', note: `${MARK} split` }] },
    },
  });
  const receipt = await p.receipt.create({
    data: {
      userId,
      transactionId: transaction.id,
      fileName: `${MARK}.png`,
      mimeType: 'image/png',
      storageKey: `${MARK}/key.png`,
      sizeBytes: 1,
      contentHash: '0'.repeat(64),
    },
  });
  const rule = await p.categoryRule.create({
    data: {
      userId,
      pattern: `${MARK.toLowerCase()} supermercado`,
      categoryId: concept.id,
      priority: 10,
    },
  });
  await p.userPreference.create({
    data: { userId, prefKey: 'cuentas_habilitadas', prefValue: true },
  });

  return {
    accountId: account.id,
    centerId: center.id,
    groupId: group.id,
    conceptId: concept.id,
    transactionId: transaction.id,
    transactionRef,
    tagId: tag.id,
    receiptId: receipt.id,
    ruleId: rule.id,
  };
}

/** `METHOD /path/:param` for every route Express has registered. */
export function registeredRoutes(app: INestApplication): string[] {
  const express = app.getHttpAdapter().getInstance() as {
    router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
    _router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
  };
  const stack = (express.router ?? express._router)?.stack ?? [];
  return stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods).map(
          (method) => `${method.toUpperCase()} ${layer.route!.path}`,
        )
      : [],
  );
}
