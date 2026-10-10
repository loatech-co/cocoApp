# 0023 — Services return the domain; one presenter per version; v2 errors in problem+json

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner, step R-2-v2 (audit "reto del plan", part 2, section 1 and 4)

## Context and problem statement

v2 (step 7.4) was a facade over v1: the services returned the v1 view
(snake_case, Spanish words: `por_revisar`, `periodicidad: 'mensual'`) and each
v2 controller ran it through `toV2`, a generic renaming table. Retiring v1
(7.10) would have meant rewriting every view, because v1 WAS the domain.

Errors told rules apart only by their Spanish sentence: 38 messages behind a
handful of generic codes (`unprocessable`, `conflict`). A client that wanted
to react to "the splits do not add up" had to compare text. iOS is about to
move to v2, so the format had to change before it did.

## Decision

1. **Services return domain types, in English** (`transactions.domain.ts`,
   `categories.domain.ts`, `interpretation.domain.ts`, the types next to the
   other services). Closed sets of Spanish words (periodicity, certainty,
   classification source, suggestion reason, granularity, breakdown level)
   become English in the domain through one table per set,
   `common/vocabulary.ts`, used both ways.
2. **Each version has its presenter**: `src/presenters/v1/*` puts back the
   exact v1 body (field names, field order, Spanish words, list envelopes);
   `src/presenters/v2/*` hands the domain out (today it is the v2 shape).
   Retiring v1 is deleting its controllers, its DTOs, `contract/v1` and
   `presenters/v1`.
3. **v1 does not change a byte.** Checked by recording every v1 response body
   of the whole e2e suite before and after (only the Wallet/SMS race test
   varies, as it did between two runs of the base). `openapi.v1.json` is
   unchanged. `contract/v1/shapes.spec.ts` ties the v1 classes to the v1
   presenters; `contract/v2/shapes.spec.ts`, the v2 classes to the domain.
4. **v2 errors are `application/problem+json` (RFC 9457)**:
   `{ type, title, status, detail, code, errors? }`. `code` is stable and in
   English, one per business rule (`common/errors/problem-codes.ts`, the
   single list); `type` is `PROBLEM_TYPE_BASE` followed by the code;
   `detail` is the Spanish sentence; `errors[]` names each field at fault
   (`FieldValidationPipe` keeps the path, `splits.0.amount`). Each
   `DomainError` subclass only accepts codes of its own status (typed).
   v1 keeps `{ error: { code, message, details } }` with its generic codes.
5. **Transactions were already paged in the database** (`findPage`: `skip`,
   `take`, `count`, `groupBy` for the sums). Nothing changed there. The
   small per-user lists (accounts, tags, receipts, cost centers) keep being
   cut in memory, as the audit allows.

## Consequences

- The v2 inputs still reach the services as v1 DTOs (`contract/v2/v1-input.ts`
  and the mappers). Moving the inputs to domain commands is the remaining
  half before v1 can be deleted without touching a service.
- `contract/v2/to-v2.ts` stays only as a reference: `api-v2.e2e-spec.ts`
  checks that v2 is exactly that translation of v1, that is, that the two
  presenters agree. It goes with v1.
- `PendingPayment.periodicity` in v2 is now documented as its enum (it was a
  plain string); the values did not change.
- Benchmark (`scripts/perf`, 15 075 transactions, 300 runs, v1 routes), base
  vs this step, p95 in ms: transactions page 1 7.8 / 5.6, per_page=200
  7.1 / 7.7, dashboard month 10.8 / 10.3, capture 5.0 / 5.1. Same within
  noise: the presenters cost nothing measurable.
