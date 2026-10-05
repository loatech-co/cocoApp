# 0011 — Literal UI text is caught by `i18next/no-literal-string`

- Status: accepted
- Date: 2026-10-05 (D6 of `docs/standards/decisions.md`)
- Deciders: phase 7, under the plan's maturity rule

## Context and problem statement

User-facing text moves to `locales/es.json` (step 7.3), consumed with
`react-i18next`. A lint rule must stop new literals in JSX. The plan's
default was `react/jsx-no-literals`.

## Considered options

- `react/jsx-no-literals` (`eslint-plugin-react`): last release 2025-04-03,
  crashes on ESLint 10. Ineligible: no release in six months.
- **`i18next/no-literal-string` (`eslint-plugin-i18next`)**: maintained,
  supports ESLint 9 and 10, matches the chosen i18n library.

## Decision outcome

**`i18next/no-literal-string` with `mode: "jsx-text-only"`.**

## Consequences

- Good: works on ESLint 10 and speaks the same vocabulary as `react-i18next`.
- Bad: attributes (`title`, `aria-label`) are not covered in this mode; the
  locale review in PRs covers them.
