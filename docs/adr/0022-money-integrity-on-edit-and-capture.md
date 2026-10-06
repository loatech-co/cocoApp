# 0022 — Money integrity when editing and capturing

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner, step R-3 (audit "reto del plan", section 4)

## Context and problem statement

Three writes could leave the money wrong without any error:

1. A PATCH that changed `amount` without sending `splits` kept the old splits,
   which no longer added up to the header.
2. A PATCH on one leg of a transfer changed that leg only, so the two accounts
   disagreed on how much moved (deleting already took both legs).
3. Wallet and the bank SMS of the same payment arrive within seconds. Each
   capture looked for its twin, neither saw the other (not written yet), and
   both were inserted: the expense counted twice.

## Decision

1. **Splits: 422, never rescale.** Changing the amount of a movement with
   splits requires the adjusted splits in the same request. The system does
   not know which concept the difference belongs to (`transactions.update.ts`).
2. **Transfers: both legs in one `$transaction`.** Date, amount, description
   and status go to the other leg inside `updateWithDetails`; the account
   stays per leg. A leg cannot change type, nor take the other leg's account.
3. **Captures: `pg_advisory_xact_lock` keyed by user and amount**
   (`capture.repository.ts`). The twin search, the merge or the insert run in
   one transaction holding the lock, all through `tx`. The key has no date:
   the duplicate window crosses days (±1), and every candidate shares the
   amount. Different amounts of the same person never wait for each other.

## Consequences

- A capture holds one pool connection while it waits for the lock; it never
  needs a second one, so it cannot starve the pool.
- With row-level security (`forUser`, its own `$transaction`), the lock is the
  first statement inside that transaction and `createUnlessTwin` receives its
  `tx` instead of opening another. A nested `$transaction` would take a second
  connection and the lock would no longer cover the insert.
- Proven by `api/test/money-integrity.e2e-spec.ts`, v1 and v2: parallel
  captures repeated eight times, and a test trigger that fails the second leg.
