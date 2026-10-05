## What and why

<!-- One paragraph. Link the plan step or issue. -->

## Checklist

- [ ] CI green (typecheck, lint, unit, e2e, builds, clean install)
- [ ] Tests added or updated for the behaviour that changed
- [ ] Migration is additive, or follows expand → verify → contract; applied BEFORE the code that needs it
- [ ] No secrets, personal data or amounts in code, logs or tests
- [ ] User-facing text in Spanish, everything else in English
- [ ] Docs updated (README, runbook, CONTRIBUTING) — and an ADR if this decides something new
- [ ] If a convention changed: CONTRIBUTING.md, CLAUDE.md and the CI check changed in this same PR
