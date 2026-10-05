# 0015 — Feature flags: OpenFeature's server SDK behind a Nest provider

- Status: accepted
- Date: 2026-10-05 (D25 of `docs/standards/decisions.md`)
- Deciders: phase 7, under the plan's maturity rule

## Context and problem statement

The plan chose OpenFeature with `@openfeature/nestjs-sdk` in the API and
`@openfeature/react-sdk` in the web, with our own provider (environment plus
`user_preferences`) and the registry in `packages/flags`. The Nest SDK is
0.x, so it is ineligible.

## Considered options

- An in-house typed registry with no OpenFeature: less code, but a tie with
  the vendor-neutral standard, so the default holds.
- **`@openfeature/server-sdk` (stable) registered as our own Nest provider.**

## Decision outcome

**API: `@openfeature/server-sdk` through a small Nest provider. Web:
`@openfeature/react-sdk` + `@openfeature/web-sdk`, unchanged.** The registry,
the exposure through `/auth/me` and the CI check of retirement dates are as
planned.

## Consequences

- Good: the same evaluation API as the wrapper, on a stable package; call
  sites do not change if a vendor is ever added.
- Bad: the wrapper's decorators are replaced by one provider of ours.
