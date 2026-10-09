#!/usr/bin/env node
//
// Leaves the LOCAL database with data worth working with.
//
// ── Why it is needed ─────────────────────────────────────────────────────────
// `api/.env` used to point at Supabase, so "having data" in development came
// for free: it was the real data. Separating the two environments took that
// away, and an empty database is no good for testing anything —not the
// pending payments, not the budget, not the donut—.
//
// ── It is IDEMPOTENT ─────────────────────────────────────────────────────────
// It can run as many times as needed: it looks up by name before creating and
// does not duplicate. That matters because it runs after every
// `migrate reset`, and a seed script that leaves two «Mercado» on a rerun
// forces a manual cleanup right when one wanted to start clean.
//
// ── And it refuses to leave this machine ─────────────────────────────────────
// Seeding writes. Pointed at a remote database by an inherited `.env`, it
// would put made-up categories into somebody's data. The check is the same as
// the one the API runs on start, and for the same reason.
//
// The names it writes (categories, the «Mercado» concept, the descriptions)
// are user data, so they stay in Spanish, like the template the sign-up
// seeds. The `siembra:` prefix of `externalRef` is the key a rerun recognises
// its own rows by, so it stays too.
import { createPrisma } from './db/prisma-client.mjs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const url = process.env.DATABASE_URL ?? '';
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
})();

if (!LOCAL_HOSTS.has(host)) {
  console.error(
    `This seeds data, and DATABASE_URL points at "${host || '(unreadable)'}", which is not your machine.\n` +
      `Run the script with the local environment:\n\n  npm run seed:local\n`,
  );
  process.exit(1);
}

const prisma = createPrisma();

/** Looks a category up by name under a parent, and creates it if it is not there. */
async function ensure(userId, parentId, name, data = {}) {
  const existing = await prisma.category.findFirst({ where: { userId, parentId, name } });
  if (existing) {
    // If it is there but lacks what this comes to set, it is completed.
    // Seeding a half-made database has to leave it whole.
    const missing = Object.fromEntries(
      Object.entries(data).filter(([k, v]) => String(existing[k] ?? '') !== String(v ?? '')),
    );
    if (Object.keys(missing).length === 0) return { row: existing, created: false };
    return {
      row: await prisma.category.update({ where: { id: existing.id }, data: missing }),
      created: false,
      adjusted: Object.keys(missing),
    };
  }
  return {
    row: await prisma.category.create({ data: { userId, parentId, name, ...data } }),
    created: true,
  };
}

const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
if (!user) {
  console.error(
    'There is no user in the local database.\n\n' +
      'Sign up once from the app: the sign-up seeds the cost-center template\n' +
      'by itself. Then run this again.',
  );
  process.exit(1);
}
const userId = user.id;
const done = [];

// ── The template, in case the database is older than it ─────────────────────
const fixed = await ensure(userId, null, 'Costos fijos', { isStatic: true });
const variable = await ensure(userId, null, 'Costos variables', { isStatic: false });
for (const [parent, children] of [
  [fixed, ['Educación', 'Vivienda', 'Familia', 'Salud y vida', 'Servicios públicos', 'Vehículos']],
  [variable, ['Licencias']],
]) {
  for (const name of children) {
    const result = await ensure(userId, parent.row.id, name);
    if (result.created) done.push(`category "${name}"`);
  }
}

// ── A recurring concept WITH a budget ───────────────────────────────────────
// Groceries and nothing else: it is the case that really tells the budget
// from the average. Rent is the same every month, so averaging it is right by
// accident; groceries are paid in several trips of different amounts, and
// there the average of the three previous months says nothing useful.
const food = await ensure(userId, variable.row.id, 'Alimentación', {
  icon: 'utensils',
});
if (food.created) done.push('category "Alimentación"');

const groceries = await ensure(userId, food.row.id, 'Mercado', {
  isRecurring: true,
  periodicity: 'monthly',
  paymentDay: 1,
  budget: '1200000',
  // Set, which is what makes it useful for testing: with the two trips below
  // it is partly paid, the state where you see whether the month's figures add
  // up.
  isMultiPayment: true,
  icon: 'shopping-cart',
});
if (groceries.created) done.push('concept "Mercado" with a budget');
else if (groceries.adjusted) done.push(`"Mercado" completed: ${groceries.adjusted.join(', ')}`);

// ── Two grocery trips this month ────────────────────────────────────────────
// So the concept is not just present but ALIVE: partly paid, which is the
// state where you really see whether the month's figures add up.
//
// `external_ref` carries the `siembra:` mark for the same reason it exists for
// automatic charges: it is the key this recognises itself by on a rerun, and
// it also says on the row that nobody typed that data.
const firstOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
const trips = [
  { day: 3, amount: '320450', where: 'Supermercado (siembra)' },
  { day: 14, amount: '287900', where: 'Supermercado (siembra)' },
];
for (const { day, amount, where } of trips) {
  const ref = `siembra:mercado:${firstOfMonth.toISOString().slice(0, 7)}:${day}`;
  const already = await prisma.transaction.findFirst({ where: { userId, externalRef: ref } });
  if (already) continue;
  const date = new Date(firstOfMonth);
  date.setUTCDate(day);
  await prisma.transaction.create({
    data: {
      userId,
      categoryId: groceries.row.id,
      date,
      period: firstOfMonth,
      amount,
      type: 'expense',
      status: 'cleared',
      description: where,
      externalRef: ref,
    },
  });
  done.push(`"Mercado" transaction on day ${day}`);
}

const totals = {
  users: await prisma.user.count(),
  'cost centers': await prisma.category.count({ where: { parentId: null } }),
  'recurring concepts': await prisma.category.count({ where: { isRecurring: true } }),
  'with a budget': await prisma.category.count({ where: { budget: { not: null } } }),
  transactions: await prisma.transaction.count(),
};

console.log(done.length ? `Seeded:\n  · ${done.join('\n  · ')}` : 'Everything was there. Nothing to do.');
console.log(`\nThe local database now has:`);
for (const [label, count] of Object.entries(totals))
  console.log(`  ${String(count).padStart(5)}  ${label}`);

await prisma.$disconnect();
