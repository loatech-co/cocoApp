# 0036 — Pausing the renewal of a recurring concept is a history of month periods

- Status: accepted
- Date: 2026-10-13
- Deciders: the owner (the five rules below are his, final), branch `feat/pause-recurring-renewal`

## Context and problem statement

A recurring concept (`categories.is_recurring`, with its periodicity, payment
day and month, budget, auto-paid and multi-payment flags) feeds three things:
the auto-charge task, the pending-payments list and the month's required
budget. The only way to stop it was to switch recurrence off or archive the
concept, and both lose something: switching off forgets the periodicity and
the budget, and archiving says «this is not coming back». A subscription that
is paused for two months, or a school fee that stops over the holidays, needs
a third answer: «not these months, then again as before».

The plan does not cover it, so the decisions are written here before the code
(CLAUDE.md).

## Decision

1. **While paused, a concept does nothing recurring for those months**: no
   automatic charge, not in pending payments, not counted in the month's
   budget. It applies to any recurring concept, auto-paid or not.
2. **The unit is a month.** «Paused from October» pauses October and every
   later month; «active again from December» makes December due again, and
   every month after it while active. Months before the pause keep everything
   they had: the pause itself never touches an existing transaction.
3. **Pausing never deletes on its own.** When a pause covers months that
   already hold AUTO-GENERATED charges of that concept, the web lists them
   (month and concept) and asks whether to delete them. Only charges the
   auto-charge task wrote are candidates: they carry the fingerprint
   `external_ref = auto:<conceptId>:<YYYY-MM>` (`chargeFingerprint`) and are
   still classified under the concept. A movement recorded by hand never is.
   The API re-checks every id it is asked to delete against that list.
4. **Pause and resume months may be past or future** («paused from January»
   can be scheduled in October).
5. **A history of periods, not a flag.** Table `recurrence_pauses`:

   | Column         | Type          | Meaning                                                          |
   | -------------- | ------------- | ---------------------------------------------------------------- |
   | `id`           | `bigserial`   |                                                                  |
   | `user_id`      | `bigint`      | owner, for the row-level security policy                         |
   | `category_id`  | `bigint`      | the concept, `ON DELETE CASCADE`                                 |
   | `from_month`   | `date`        | first PAUSED month, stored as day 1                              |
   | `resume_month` | `date` (null) | first month ACTIVE AGAIN, day 1; `NULL` = paused with no end yet |
   | `created_at`   | `timestamp`   |                                                                  |
   | `updated_at`   | `timestamptz` |                                                                  |

   The period is half-open, `[from_month, resume_month)`. `resume_month` is
   the resume month and not the last paused month because that is what the
   person answers («¿Desde qué mes se reactiva?»), so nothing converts it, and
   because two half-open periods overlap exactly when
   `a.from < b.resume AND b.from < a.resume`, with no ±1.

   «Is it paused in month M» is DERIVED from the periods every time, never
   stored, the same as balances and budgets. Every place that decides whether
   a concept is due in a month goes through one function,
   `isConceptDueInMonth` (`api/src/common/recurrence/recurrence.ts`):
   periodicity first, then the pauses. For a non-monthly periodicity the pause
   simply removes the due months that fall inside it; the cycle does not
   move.

   Rules, checked by the API (and the shape ones also by CHECK constraints):
   only on a recurring concept; months are day 1; `resume_month` is after
   `from_month`; periods of a concept never overlap, so there is at most one
   open period. The overlap check runs in one unit of work that first locks
   the concept's row, so two simultaneous requests cannot both pass it. An
   exclusion constraint would say it in the database, but it needs the
   `btree_gist` extension, which the migration role cannot be assumed to
   create.

The API (v2) gains, under `/api/v2/categories/:id/pauses`: list the history,
pause (`fromMonth`), resume an open pause (`resumeMonth`), delete a period
(a pause scheduled by mistake) and, for one period, list the auto-generated
charges inside it and delete the ones the person confirmed.

## Consequences

- The table belongs to a new module, `modules/recurrence`. It needs the
  categories (is it a recurring concept?) and the ledger (the auto charges),
  and the dashboard needs it, so it cannot live in `categories` without a
  module cycle.
- The migration is additive and carries its own policy, as every user table
  does: the expected policy count goes from 14 to 15
  (`scripts/db/expected-policies.sh`). A restore of a backup taken before this
  migration counts 14, and passes with `EXPECTED_POLICIES=14`.
- Deleting a pause does not bring back what it suppressed: the auto-charge
  task never fills past months (it only charges the current one), so a month
  that was paused and is no longer stays without its automatic charge.
- Resuming in the current month does not charge at once: the task runs at
  00:05 and at start-up, and until then the concept shows as pending, which
  is true.
- The iOS app does not read recurrence: nothing changes there.
