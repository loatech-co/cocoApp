# 0006 — The iOS app is hybrid: native capture, the web for the rest

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner, phase 5 of the plan

## Context and problem statement

The phone has to do what the web cannot: register an expense in ten seconds
with one hand, take a photo of a receipt, and receive what Wallet and bank
SMS automations send. Rebuilding every screen in SwiftUI would double the UI
to maintain for one developer.

## Decision outcome

**SwiftUI for capture — manual form, camera, Wallet and SMS intents, widgets
and controls, the offline queue — and the same web app inside a `WKWebView`
for everything else, with ONE session owned by the app.**

- Session by bridge, not by cookie or URL: the embedded web has no refresh
  token; it asks the app through `WKScriptMessageHandlerWithReply` and the
  app answers with an access token from its single-flight session actor.
  Supabase rotates refresh tokens and detects reuse, so two rotators on one
  family would log each other out.
- The web knows it is embedded by two signals: the `CocoiOS/` user agent and
  the bridge's existence. A user agent can be faked; the bridge cannot.
- A network failure of the bridge never clears the keychain; only password
  change and "sign out everywhere" end the session.
- Native tab bar with four tabs; the rest of the navigation is the web's.

## Consequences

- Good: one UI for reading and editing, native only where the phone adds
  something.
- Bad: web and iOS must ship bridge changes together (handler and event
  names are a contract).
- Bad: signed with a free personal team, so the build expires every 7 days
  and must be reinstalled ([runbook](../runbook.md#renew-the-ios-build-every-7-days)).
