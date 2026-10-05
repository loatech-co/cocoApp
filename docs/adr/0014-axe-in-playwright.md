# 0014 — Accessibility is checked by axe in the Playwright journeys

- Status: accepted
- Date: 2026-10-05 (D16 of `docs/standards/decisions.md`)
- Deciders: phase 7, under the plan's maturity rule

## Context and problem statement

The plan put `eslint-plugin-jsx-a11y` in the lint config. Its last release
is from 2024-10-26 and it does not support ESLint 10; its fork is 0.x. There
is no eligible static accessibility plugin today.

## Considered options

- `eslint-plugin-jsx-a11y`, pinned through `overrides`. Ineligible.
- `eslint-plugin-jsx-a11y-x`. Ineligible (0.x).
- **`@axe-core/playwright` on the rendered pages.**

## Decision outcome

**Each Playwright journey runs an `AxeBuilder` assertion and fails on
serious or critical violations.**

## Consequences

- Good: axe sees the rendered DOM, so it also catches contrast and ARIA
  problems a static rule cannot.
- Bad: only pages covered by a journey are checked, and only in CI, not in
  the editor.
- Revisit if `jsx-a11y` ships ESLint 10 support.
