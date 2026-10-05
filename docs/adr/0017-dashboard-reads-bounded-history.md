# 0017 — The dashboard reads only the history its estimate uses

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner, step 7.9 of phase 7

## Context and problem statement

`GET /dashboard` estimates what each recurring concept will cost this month
(`estimadoDelMes`): the average of the three previous months that had a
payment, or, when none of them did, the last month that had one. To get there,
`LedgerRepository.monthlyHistory` loaded **every** movement of every recurring
concept before the current month, with no lower date bound, and summed them by
month in JavaScript.

The cost grew with every year of data while the answer did not change. The
7.1 baseline (`docs/standards/audit.md`, section 3) measured the current-month
dashboard 2.4× slower on a 2,045-row history than on the same data with 409
rows. On the long-history benchmark database that read is 1,238 rows to answer
a question about 17 of them.

## Decision

`monthlyHistory(userId, ids, { before, since })` reads only what the estimate
reads:

1. One `groupBy` returns the last period with a payment for each concept (an
   aggregate in Postgres, no rows come back).
2. One `findMany` reads, per concept, from `since` (the first day of the
   oldest of the three months, `ventanaDeLaHistoria`) to `before` — or, when
   the concept's last payment is older than `since`, from the first day of
   that last month, so the fallback month comes back whole.

Both callers (the dashboard's pending payments and the auto-charge task) pass
the same window, built from the same `mesesAnteriores` the estimate uses.

## Proof that no number changed

`api/test/dashboard-history.e2e-spec.ts` seeds twenty years of history with
every case the estimate distinguishes: monthly concepts with two payments in
some months, an annual one with nothing in the window (fallback to last
October), one last paid twelve years ago with two payments on different days
of its last month, one paid in two of the three window months, one with a
budget, and one never paid. It asserts that:

- every concept's estimate from the bounded read equals the one from the full
  history (the query the repository used to run, reproduced in the test), and
- the **whole `DashboardService.resumen` payload** is byte-identical when the
  history comes from the bounded read and when it comes from the full one.

Breaking the fallback bound on purpose makes both tests fail.

## Numbers

`scripts/perf/api-bench.mjs` on `coco_bench` (2,045 movements, `bench-db.sh
create --long`), 200 timed requests after 20 warmups, median of 5 alternating
rounds of the build before (`COCO_BENCH_API_DIST`) and after. The machine was
shared with other jobs (load average 18–150), so absolute values are high;
the before/after rounds alternate so both carry the same load.

| GET `/dashboard` (ms)  | p50 before | p50 after | p95 before | p95 after |
| ---------------------- | ---------- | --------- | ---------- | --------- |
| current month, run 1   | 9.2        | 5.1       | 15.1       | 8.8       |
| current month, run 2   | 9.0        | 6.3       | 14.3       | 11.3      |
| 2000-01-01..2026-12-31 | 28.1       | 23.9      | 46.1       | 38.5      |

On the 409-row copy the difference is within noise (4.4 vs 4.5 ms p50), as
expected: with little history there was little to skip.

## Consequences

- Good: the dashboard's cost no longer grows with years of recurring history.
- Good: same query count order (two instead of one), both on
  `idx_tx_user_category` / `idx_tx_user_period`.
- Bad: the repository now knows the shape of the window (a lower bound plus a
  per-concept fallback). If the estimate ever reads further back, the window
  in `ventanaDeLaHistoria` has to move with it; the e2e test is what catches
  a mismatch.
- The full-range dashboard (`from=2000`) still reads every movement in the
  range for the totals and the trend; that is the question being asked, not
  waste.
