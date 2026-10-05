# 0004 — One reading engine, run by the API

- Status: accepted
- Date: 2026-10-04
- Deciders: the owner, phase 3 of the plan

## Context and problem statement

The rules that turn a text — an OCR'd receipt, a Wallet notification, a bank
SMS — into an amount, a date, a merchant and a category lived in the web app.
The iOS app (phase 5) needed the same rules. Two copies of a classifier drift:
a keyword works in the browser and not on the phone, and the same money ends
up classified differently depending on where it was entered.

## Considered options

- Keep the logic in the web app and port it to Swift.
- **Move interpretation to the API; clients send text and receive a proposal.**

## Decision outcome

**Interpretation runs in one place: `packages/lectura`, called by the API**
(`POST /transactions/interpret` to propose, `POST /transactions/capture` to
interpret and save in one request). Turning pixels into text (pdf.js,
Tesseract) stays in the client, so files never need to leave the device to
be read.

- `interpretar()` is pure: the service passes it the category tree and the
  history suggestion, so it is tested without a database.
- The package compiles to CommonJS (`dist/`, built on `postinstall`) so the
  API can `require` it at runtime; the web resolves it from source.
- The web keeps **no** local fallback classification: two would be two places
  where rules change. If the server fails, the file stays attached and the
  user types the data.
- Archived concepts are excluded from proposals.
- History counts as high certainty from 80 % (`HISTORIAL_SEGURO`): unanimity
  and user-made rules pass; seeded rules and split histories ask for review.

## Consequences

- Good: web, iOS, Wallet and SMS get the same answer for the same text.
- Good: the precedence (manual choice, history, the user's keywords, the
  system dictionary) is defined and tested once.
- Bad: classification needs the network; captures offline wait in the iOS
  queue (see [0005](0005-idempotency-by-external-ref.md)).
- Open: how iOS reads documents itself, if it ever does, is a pending
  decision (owner's block A).
