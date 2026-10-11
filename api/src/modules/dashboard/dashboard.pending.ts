/**
 * What is left to pay this month: the live recurring concepts and what each
 * one still owes, no database needed. `DashboardService.summary` composes it.
 */
import type { Tree } from './dashboard.summary';
import type { PendingPayment } from './dashboard.types';
import { pendingOutcome, expectedForMonth, isDueInMonth, dueDate } from './pending';
import { ZERO, serialize, toMoney, type Money } from '../../common/money/money';
import type { SummaryCategory } from '../categories/category-lookup.service';
import type { MonthlyHistory } from '../transactions/ledger.service';
/** A recurring concept that can be due: it has a periodicity. */
export type RecurringConcept = SummaryCategory & {
  periodicity: NonNullable<SummaryCategory['periodicity']>;
};

/*
  ARCHIVED concepts do not come in here, and the word «here» is the whole
  rule.

  Archiving a concept says «this is not coming back»: the gym membership
  that was cancelled, the insurance of the car that was sold. Asking for it
  every month in pending payments asks for something nobody will ever pay,
  and that row could only leave the list by unarchiving the concept —the
  opposite of what was intended—.

  But it only leaves THIS list and the month's budget. What the concept
  cost in the months it was alive still counts in the donut, the totals and
  the trend: archiving looks forward and does not rewrite what already
  happened. That is why the filter goes here and not in the categories
  query, which is what the historical figures read from.
*/
export function liveRecurring(categories: readonly SummaryCategory[]): RecurringConcept[] {
  return categories.filter(
    (c): c is RecurringConcept => c.isRecurring && c.periodicity !== null && !c.isArchived,
  );
}

/*
  ── What is needed this month ───────────────────────────────────────────
  The sum of ALL recurring concepts due this month, paid or not. The
  question is "how much money do I need this month?", and that is why what
  was already paid counts: a budget that shrinks every time one pays
  something is not a budget, it is the outstanding balance —and the pending
  payments card already says that, from this very same pass—.

  What was paid comes in at what it REALLY cost this month; what is
  missing, at what it cost last time, which is the only thing known in
  advance.
*/
export function pendingThisMonth(
  recurring: readonly RecurringConcept[],
  data: { history: MonthlyHistory; paidThisMonth: ReadonlyMap<string, Money> },
  currentMonth: string,
  tree: Tree,
): { pending: PendingPayment[]; budget: Money } {
  const pending: PendingPayment[] = [];
  let budget = ZERO;

  for (const concept of recurring) {
    // First whether it is due this month: a quarterly one that does not fall
    // here neither counts for the budget nor shows as pending.
    if (!isDueInMonth(concept.periodicity, concept.paymentMonth, currentMonth)) continue;

    const key = concept.id.toString();
    const paid = data.paidThisMonth.get(key);

    // The SAME figure shown in the pending list: if the budget were
    // estimated another way, the two cards on the same screen would say
    // different things about the same money.
    //
    // And the concept's budget, when it has one, beats the average.
    // See `expectedForMonth`.
    const expected = expectedForMonth(
      concept.budget === null ? null : toMoney(concept.budget),
      data.history.get(key) ?? new Map(),
      currentMonth.slice(0, 7),
    );

    // Whether it is still due and how much it adds to the budget are decided
    // by a single function, because the two answers have to agree with each
    // other: a concept that leaves the list for being covered cannot enter
    // the budget at what was expected.
    const outcome = pendingOutcome({
      isMultiPayment: concept.isMultiPayment,
      hasPayment: paid !== undefined,
      paid: paid ?? ZERO,
      expected,
    });

    budget = budget.plus(outcome.towardBudget);
    if (!outcome.isStillDue) continue;

    pending.push(pendingPaymentOf(concept, expected, paid, currentMonth, tree));
  }

  // By date: what is due first is what needs looking at first.
  pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { pending, budget };
}

function pendingPaymentOf(
  concept: RecurringConcept,
  expected: Money | null,
  paid: Money | undefined,
  currentMonth: string,
  tree: Tree,
): PendingPayment {
  // The full path: "Alquiler" alone does not say which center it hangs
  // from. And on the way the ROOT shows up, which is the cost center: it is
  // what says whether this is fixed or variable.
  const ancestors: string[] = [];
  let current = tree.byId.get(concept.id.toString());
  let root = concept.id.toString();
  while (current?.parentId) {
    const parent = tree.dataById.get(current.parentId.toString());
    if (!parent) break;
    ancestors.unshift(parent.name);
    root = current.parentId.toString();
    current = tree.byId.get(current.parentId.toString());
  }

  return {
    categoryId: concept.id,
    name: concept.name,
    path: ancestors.join(' · '),
    periodicity: concept.periodicity,
    dueDate: dueDate(currentMonth, concept.paymentDay),
    expectedAmount: expected === null ? null : serialize(toMoney(expected)),
    costCenterId: BigInt(root),
    costCenter: tree.dataById.get(root)?.name ?? '',
    // Always, in the normal ones too —where it is zero—, so the screen does
    // not have to wonder whether the field is there.
    paidAmount: serialize(paid ?? ZERO),
    isMultiPayment: concept.isMultiPayment,
  };
}
