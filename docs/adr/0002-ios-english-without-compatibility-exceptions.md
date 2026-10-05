# 0002 — iOS identifiers in English, with no compatibility exceptions

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner, step 7.13d of phase 7

## Context and problem statement

Steps 7.13 to 7.13c moved the iOS code to English but kept in Spanish
everything something outside the code stores by name: App Intent types and
their `@Parameter`s (Shortcuts automations), the `CocoAccesos` target and its
widget and control `kind`s, background task identifiers, UserDefaults and
Keychain keys, folders and on-disk JSON keys (the capture queue and the
category tree). Renaming them would break a phone that already had the app.

The iOS app is **not installed on any phone**: there are no automations,
widgets or stored data to protect.

## Decision

**Every iOS identifier goes to English now, with no compatibility layer.**
The intents are `RecordManualExpenseIntent`, `RecordWalletExpenseIntent`,
`RecordSMSExpenseIntent`, `OpenCaptureIntent` (`init(destination:)`) and
`CocoShortcuts`; the extension is `CocoWidgets` (bundle id
`co.loatech.coco.widgets`); tasks, keys, folders, `coco://` routes and
on-disk JSON keys are English. On-disk types use synthesized keys.

Two things stay as they are, because they are contracts with something
outside `ios/`:

- **The `v1` API JSON keys** (`texto`, `monto`, `clasificacion`…). They move
  to English with `/api/v2`. `CaptureBody` keeps them both on the wire and
  inside a queued capture. `APIKeysTests` pins them.
- **The web bridge message names** (`cocoSesion`, `sesionCerrada`…), which
  the frontend defines.

What the person reads — Shortcuts and Siri phrases and titles, the widget's
display name — stays in Spanish.

## Consequences

- Good: one rule, no list of exceptions to remember. `StoredFormatTests`
  pins the new on-disk names, and from now on a rename there is a migration.
- Bad: the extension's new bundle id spends one more of the free team's 10
  App IDs per week the first time it is signed.
- Once the app is on a phone, this freedom is gone: changing any of these
  names needs a migration or breaks the person's automations.
