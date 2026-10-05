# 0002 — Portable-first stack on a zero-cost host

- Status: accepted; the database and identity layers are superseded by
  [0003](0003-postgres-and-auth-on-supabase.md)
- Date: 2026-08-06
- Deciders: the owner, from the stack analysis written for Coco before the
  first line of code (`docs/Coco_TechStack_Analisis.md`, distilled here and
  removed in step 7.12)

## Context and problem statement

Coco has two possible lives: a personal stage — the owner plus up to about 50
users, on the Hostinger plan already paid for, at zero extra cost — and a
possible product stage on professional infrastructure. The question was which
stack serves the first stage without trapping the second.

Sizing for the first stage: a personal-finance app with 50 users is a few
requests per minute. The heavy work is reading receipts and statements; done
in the browser, it costs the server nothing. The real ceilings of the shared
plan are burstable CPU with an unpublished hourly quota, one process with
little RAM, a small connection limit on the shared database, and backups that
are ours to run. None of them blocks 50 users; each one is a signal for the
second stage.

## Considered options

- Proprietary low-cost platforms (logic in a vendor's functions, engine-only
  types): cheap now, a rewrite to leave.
- Production-grade from day one (containers, queues, services): cost and
  operations a one-user product cannot carry.
- **Standard, decoupled, portable pieces deployed in the simplest free way.**

## Decision outcome

**Every piece must be liftable to other infrastructure without rewriting
business logic.** The stack: React + Vite + TypeScript as a static SPA;
Node.js + NestJS + TypeScript; Prisma as the ORM; document reading in the
client behind a swappable `OcrProvider`; deploy on the Hostinger Node.js app.

The design rules that keep the promise, all still in force:

- Portable SQL schema through Prisma; no engine-only features.
- Every row scoped by `user_id`, derived from the verified token, never from
  the client. Multi-user is "more users", not a redesign.
- Stateless API: every request carries its token; nothing lives in process
  memory between requests (the host runs several processes, see the runbook).
- Configuration only by environment; moving hosts is changing variables.
- The frontend is 100 % static and works from any CDN.
- Migrations versioned with Prisma, applied the same way everywhere.

Migration triggers for the second stage, by signal and not by taste:
sustained CPU throttling or RAM at the limit (move the API to a VPS/PaaS);
the database connection limit under concurrency (managed database with
pooling); paying customers who need an SLA (replicas, managed backups,
observability); high-quality server-side reading as a product feature (a new
`OcrProvider`).

## Consequences

- Good: zero hosting cost today, one stack the owner already maintains, and a
  move to the second stage that is relocation, not reconstruction.
- Good: the per-user scoping made the later isolation test (50 routes
  attacked by a second user, 0 gaps) a check rather than a redesign.
- Bad: the shared host's quirks (process quota, injected variables, several
  processes) are ours to know; they live in [the runbook](../runbook.md).
- Bad: backups are our job until a managed database takes them over.
