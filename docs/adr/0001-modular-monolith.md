# 0001 — Coco is a modular monolith

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner, step 7.4 of phase 7

## Context and problem statement

Coco is one NestJS process (`api/`) on a shared Hostinger plan with a minimal
process quota, serving its own web build, with one Postgres database. The web
app (`frontend/`) and the iOS app (`ios/`) talk to it over `/api/v1`. Step 7.4
gave the API real boundaries — one module per resource, repositories as the
only door to the database, modules talking only through each other's
services — and the question is what those boundaries are for: a step toward
services, or the shape of the system.

## Decision

**Coco is a modular monolith. A module is split out into its own service only
when it has a concrete need the monolith cannot cover** — a different scaling
profile, a different runtime, a different owner or release cadence — and that
need is written down first.

The web and iOS apps are **clients of the core**, not services: they own no
data and no business rule that the API does not also enforce.

## Consequences

- Good: one deploy, one process, one database transaction per unit of work,
  no network between modules. It fits the hosting's process quota.
- Good: the boundaries are real and checked in CI (`npm run depcruise`:
  dependency-cruiser plus the table-ownership check), so a module that ever
  needs to leave already has a service as its contract and owns its tables.
- Bad: nothing stops a module from growing large inside the process; the size
  limits and the boundary rules are what hold the line.
- Bad: a few cross-module table accesses remain where a module cycle or a
  single-transaction unit of work makes them hard to remove; they are listed
  as known exceptions in `scripts/ci/table-ownership.mjs` until a design
  decision removes them.
