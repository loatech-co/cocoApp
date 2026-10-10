# 0029 — Web coverage floor: 70 % lines, 66 % branches

- Status: accepted
- Date: 2026-10-09
- Deciders: the director of phase 7, steps 7.7-web-b, 7.7-web-c and J-2

## Context and problem statement

The plan (7.7) asks for 70 % coverage in the web. The gate arrived in step
7.7-web-b at the level measured that day, 55 / 49 (lines / branches), and was
raised step by step: 60 / 57 in 7.7-web-c, once every `features/*/model` was
covered. In step J-2 the measurement was 72.05 % lines and 68.24 % branches,
and the J-6 review measured 72.19 / 68.37.

Lines passed 70. Branches did not, and raising the branch floor to 70 meant
writing tests for about two points of branches that are mostly defensive
(`?? null` that cannot happen, default values in destructuring) in
components and hooks of `features/`.

## Decision

1. **The floor is 70 % lines and 66 % branches** for `frontend/src`
   (`frontend/vitest.config.ts`), plus 98 / 96 for `src/shared/ui/**`, so
   that what is already covered cannot drop while hiding in the average.
2. **The branch floor sits about two points under the measurement**, the
   same margin the other floors keep, so a refactor that moves a branch does
   not fail the build for noise.
3. **A floor only goes up.** Whoever raises the measurement by a full point
   raises the floor in the same PR; nobody lowers it without a new ADR.
4. The generated client (`src/shared/api/generated/**`) stays out of the
   measurement: it would grade Orval, not us.

## Considered options

- **70 / 70 now.** Two points of tests written for the number, on branches
  that cannot be reached; that is the kind of test that gets deleted at the
  next refactor.
- **Keep 60 / 57.** Leaves ten points of room for coverage to fall unnoticed.

## Consequences

- The senior checklist item "CI with minimum coverage" is **done**, with this
  ADR as the reason for the branch number.
- Where the uncovered branches are is in CONTRIBUTING, "Frontend tests and
  coverage". The API keeps its own 80 / 80 floor and measures well above it.
