import type {
  Account,
  Category,
  Prisma,
  PrismaClient,
  Transaction,
} from '../../src/generated/prisma/client';

/**
 * Test data factories. Each one writes a valid row with neutral defaults, so a
 * test spells out only the fields it is about:
 *
 *   const tx = await makeTransaction(prisma, user.id, { amount: 100 });
 *
 * Users come from `startApp().createUser()`, which also opens a session
 * against the Supabase double; a bare user row could not log in.
 */

/** The owner's client from `startApp()`, not the app's: fixtures cross users. */
type Db = PrismaClient;

export async function makeAccount(
  db: Db,
  userId: bigint,
  overrides: Partial<Prisma.AccountUncheckedCreateInput> = {},
): Promise<Account> {
  return db.account.create({ data: { name: 'Efectivo', type: 'cash', ...overrides, userId } });
}

/** The three levels a movement hangs from. */
export interface ConceptTree {
  center: Category;
  category: Category;
  concept: Category;
}

/**
 * A center, a category inside it and a concept inside that. `concept` overrides
 * the leaf, where recurrence, budget and keywords live.
 */
export async function makeConcept(
  db: Db,
  userId: bigint,
  overrides: {
    center?: Partial<Prisma.CategoryUncheckedCreateInput>;
    category?: Partial<Prisma.CategoryUncheckedCreateInput>;
    concept?: Partial<Prisma.CategoryUncheckedCreateInput>;
  } = {},
): Promise<ConceptTree> {
  const center = await db.category.create({
    data: { name: 'Casa', ...overrides.center, userId },
  });
  const category = await db.category.create({
    data: { name: 'Servicios', ...overrides.category, userId, parentId: center.id },
  });
  const concept = await db.category.create({
    data: { name: 'Luz', ...overrides.concept, userId, parentId: category.id },
  });
  return { center, category, concept };
}

/**
 * A movement. Dates are plain `YYYY-MM-DD` strings here, and `period` defaults
 * to the first day of the month of `date`, which is what the API stores.
 */
export async function makeTransaction(
  db: Db,
  userId: bigint,
  overrides: Omit<Partial<Prisma.TransactionUncheckedCreateInput>, 'date' | 'period'> & {
    date?: string;
    period?: string;
  } = {},
): Promise<Transaction> {
  const { date = '2026-09-10', period, ...rest } = overrides;
  return db.transaction.create({
    data: {
      amount: '1000',
      ...rest,
      userId,
      date: new Date(date),
      period: new Date(period ?? `${date.slice(0, 7)}-01`),
    },
  });
}
