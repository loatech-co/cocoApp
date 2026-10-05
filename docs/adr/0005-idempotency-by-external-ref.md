# 0005 — Idempotent writes by `external_ref`

- Status: accepted
- Date: 2026-10-04
- Deciders: the owner, phases 3 to 6

## Context and problem statement

The same transaction can arrive more than once: the iOS queue retries after a
timeout whose request did succeed, a Shortcut automation fires twice, the
daily auto-charge task starts in every process the host launches (three were
seen in seven seconds), and a historical load can be cut halfway and rerun.
A duplicate of money is a wrong balance that nobody notices for months.

## Decision outcome

**Every write that can repeat carries a client- or rule-generated
`external_ref`, unique per user (`(user_id, external_ref)`), and the database
— not a prior read — decides.**

- iOS persists each capture to disk with a UUID `external_ref` before
  touching the network, and retries with backoff; 429 is retryable.
- Auto-charges use a deterministic ref, `auto:<concept>:<month>`.
- The race between two retries is resolved by the unique index: a Prisma
  `P2002` on it is answered as "already there", with the existing row.
- `POST /transactions/capture` always answers 200, with `repetido` and
  `fusionado` saying what happened. A 201 only sometimes would make the
  retrying client treat two codes as one outcome.
- Wallet and SMS for the same purchase are different refs; they are merged
  by a 10-minute window (`VENTANA_DE_DUPLICADO_MS`), wide enough for a slow
  bank SMS and narrow enough not to merge two identical coffees half an hour
  apart.

## Consequences

- Good: retries, double triggers and several processes are safe without
  locks or in-memory state.
- Bad: accepting a row flagged as a duplicate collides with the unique index;
  that is a product decision still open.
- Rule for new code: any state kept in process memory must assume several
  processes; idempotency belongs in the database.
