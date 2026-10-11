# 0016 — Performance budgets checked by the Lighthouse CLI, median of five

- Status: accepted
- Date: 2026-10-05 (D27 of `docs/standards/decisions.md`)
- Deciders: phase 7, under the plan's maturity rule

## Context and problem statement

The plan made Lighthouse CI (`@lhci/cli`) a blocking check on login, the
dashboard and the transaction sheet. `@lhci/cli` has had no release or
commit since 2025-06-26, so it is ineligible. The Lighthouse engine itself is
maintained by Google, and its scores vary from run to run.

## Considered options

- Unlighthouse; a non-blocking Lighthouse.
- **The `lighthouse` CLI driven by a short script of ours.**

## Decision outcome

**`lighthouse` 13.x, run five times per page by `scripts/perf/lighthouse.mjs`;
the median is compared with the 7.9 budget and the check blocks.**
Authenticated pages reuse a Playwright storage state.

## Consequences

- Good: the same gate on a maintained engine; the median of five is Google's
  own guidance against score variance.
- Bad: about forty lines of script to own instead of a configured tool.
- Update (2026-10-10): the script was written as plain ESM,
  `scripts/perf/lighthouse.mjs`, not the `lighthouse.ts` this ADR first
  named; the decision is unchanged.
