import { type CategoryTree } from '@/shared/api/categories';

import type { Recurrence } from '../components/recurrence-fields';

/**
 * What a concept's form reads from the tree and what it sends to the server.
 *
 * Pure functions: the form (`ConceptModal`) and its state
 * (`useConceptForm`) only decide WHEN they are called.
 */

/** The recurrence the form opens with: the concept's, or the factory default. */
export function initialRecurrence(concept: CategoryTree | null | undefined): Recurrence {
  return {
    isRecurring: concept?.isRecurring ?? false,
    periodicity: concept?.periodicity ?? 'monthly',
    paymentDay: concept?.paymentDay ?? 1,
    // The current month: if someone switches to quarterly, the most likely thing is that the
    // cycle starts now, not in January.
    paymentMonth: concept?.paymentMonth ?? new Date().getMonth() + 1,
    // No decimals: the field writes whole pesos, which is how
    // money is written here. A «180000.00» coming back from the API would be shown with a
    // «.00» nobody typed and that the field does not let you delete.
    budget: concept?.budget != null ? String(Math.round(Number(concept.budget))) : '',
    isAutoPay: concept?.isAutoPaid ?? false,
    isMultiPayment: concept?.isMultiPayment ?? false,
  };
}

/*
  ── The categories of the SAME cost center, and only those ─────────────────
  Moving a concept to another category is correcting where it sits inside its cost center:
  «Claro Móvil» was in Vivienda and belongs in Servicios públicos. Moving to another
  COST CENTER is something else —it changes which pot the money comes out of— and it is the kind of
  decision that is not made in passing in a dropdown while correcting a
  name.

  And there is a practical reason on top: a cost center can be static, and then
  what hangs from it is not reclassified. Offering the jump between cost centers
  would force deciding here what happens to that rule; by limiting it to its own
  cost center, the question does not exist.
*/
export function siblingCategories(
  tree: CategoryTree[],
  concept: CategoryTree | null | undefined,
): { value: string; label: string }[] {
  return tree.flatMap((costCenter) => {
    const categories = costCenter.children ?? [];
    return categories.some((g) => g.id === Number(concept?.parentId))
      ? categories.map((g) => ({ value: String(g.id), label: g.name }))
      : [];
  });
}

/*
  ── The name clash ──────────────────────────────────────────────────────
  Duplicates show up on their own: one import creates "Movistar", another creates
  "MOVISTAR S.A.", and from then on the same bill adds up separately in
  two concepts. No total adds up and the donut shows two slices where
  there is one.

  Just renaming does not fix it —there would be two concepts with the same
  name, which is worse: they look the same and keep adding up separately—, so
  when the name already exists, merging them is offered.

  Ignoring capitals and extra spaces, which is exactly how the same
  thing gets written differently twice.
*/
export function findTwin(
  tree: CategoryTree[],
  concept: CategoryTree | null | undefined,
  name: string,
): CategoryTree | undefined {
  return conceptsOf(tree).find(
    (c) => c.id !== concept?.id && normalize(c.name) === normalize(name),
  );
}

/** The fields that are saved, when creating and when editing. */
export function conceptFields(name: string, recurrence: Recurrence, keywords: string[]) {
  return {
    name: name.trim(),
    isRecurring: recurrence.isRecurring,
    periodicity: recurrence.isRecurring ? recurrence.periodicity : null,
    paymentDay: recurrence.isRecurring ? recurrence.paymentDay : null,
    // The month only means something if the cycle is not monthly.
    paymentMonth:
      recurrence.isRecurring && recurrence.periodicity !== 'monthly'
        ? recurrence.paymentMonth
        : null,
    /*
      Empty is `null`, not zero.

      They are two different things and the API tells them apart: `null` is «I don't know,
      estimate it with the average» and zero is «this costs nothing now». Sending zero
      for a blank field would make the concept disappear from the month's budget
      without anyone having asked for it.

      And if it stops being recurring it goes away with the recurrence: a budget
      «each time» means nothing where there is no next time.
    */
    budget:
      recurrence.isRecurring && recurrence.budget.trim() !== '' ? Number(recurrence.budget) : null,
    // It goes away with the recurrence, like the budget: charging only «each time»
    // means nothing where there is no next time.
    isAutoPaid: recurrence.isRecurring && recurrence.isAutoPay,
    /*
      It goes away with the recurrence for the same reason, and besides NEVER together with
      automatic payment.

      The second filter looks redundant —on the screen the two
      switches exclude each other— but it is not: the exclusion there depends
      on a state this function does not control, and it only takes someone
      reordering the fields for both flags to slip through switched on. The
      API would answer 422 and the concept would not be saved, which is fine
      as a last defense but it is an error that has no reason to ever
      happen.
    */
    isMultiPayment: recurrence.isRecurring && recurrence.isMultiPayment && !recurrence.isAutoPay,
    keywords,
  };
}

/** The changes when editing: the fields, and the category only if it really changed. */
export function conceptChanges(
  fields: ReturnType<typeof conceptFields>,
  category: string,
  concept: CategoryTree,
) {
  return {
    ...fields,
    // Only if it really changed: a `parentId` on every save
    // triggers the cycle and tree-depth checks
    // for nothing.
    ...(category !== '' && Number(category) !== Number(concept.parentId)
      ? { parentId: Number(category) }
      : {}),
  };
}

/** What gets created, hanging from the category whose button opened the form. */
export function newConcept(fields: ReturnType<typeof conceptFields>, categoryId?: number) {
  return {
    ...fields,
    kind: 'expense' as const,
    ...(categoryId === undefined ? {} : { parentId: categoryId }),
  };
}

/** The concepts of the tree: the leaves, which is where the transactions hang. */
function conceptsOf(tree: CategoryTree[]): CategoryTree[] {
  return tree.flatMap((costCenter) =>
    (costCenter.children ?? []).flatMap((category) => category.children ?? []),
  );
}

/** Two names are the same if they only differ in capitals or spaces. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
