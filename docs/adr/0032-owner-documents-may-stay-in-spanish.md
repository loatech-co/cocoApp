# 0032 — Documents the owner reads may stay in Spanish

- Status: accepted (narrows phase 7, decision 1)
- Date: 2026-10-09
- Deciders: the director of phase 7, after finding 10 of the independent J-6 review

## Context and problem statement

Phase 7 starts from one decision
([plan, phase 7, "Decisiones de partida", 1](../plan-completo.md#fase-7-estándares-y-mantenibilidad)):
**English** for everything a developer sees —files, folders, identifiers,
tables, columns, enum values, routes, comments, commits, technical
documentation— and **Spanish** only for the texts the user sees, kept in one
catalog. `CLAUDE.md` repeats it as a rule that is never broken.

The J-6 review found the rule broken in two different ways. Comments in
Spanish in the code (about 424 lines in iOS, `app.module.ts`, `bootstrap.ts`,
`api/.env.example`, `frontend/index.html`, a `lefthook.yml` message): those
are plain debt and step J-6d translates them. And documents in Spanish:
`CLAUDE.md`, `.claude/rules/*.md`, `ios/README.md`, the plan, the
autonomous log, the handoffs, the reports.

The second group is not debt. The owner directs the work, reads those
documents to decide and works in Spanish. A rule written in a language its
reader handles less well is a rule read less carefully, and these are the
documents whose rules are never broken.

## Decision

1. **Documents the owner reads may be in Spanish.** They are: `CLAUDE.md`,
   `.claude/rules/*.md`, `.claude/agents/` and `.claude/commands/`, the
   handoffs (`.claude/traspasos/`), the plan (`docs/plan-completo.md`), the
   autonomous log (`docs/registro-autonomo.md`), the runbook, the ADRs, the
   phase reports and `ios/README.md`. "May": the ones already in English
   (the runbook, the ADRs) stay in English; nothing is translated back.
2. **Everything else goes in English, as decision 1 says:** code,
   comments, identifiers, file and folder names, configuration and its
   comments (`.env.example`, workflows, hooks and their messages), commit
   messages and PR titles, and the technical documentation written for
   contributors (`README.md`, `CONTRIBUTING.md`, `docs/architecture.md`,
   `docs/standards/`).
3. **Texts the user sees stay in Spanish**, as before, and so do Spanish
   test data and string literals that the user sees.
4. A file is in the exception because it is in the list of point 1, not
   because it is in Spanish. A new owner document joins the list here.

## Considered options

- **Translate everything.** Satisfies decision 1 to the letter, and leaves
  the owner reading his own working rules in a second language. Rejected.
- **Leave the documents as they are, with no ADR.** Every audit would find
  the same "contradiction" again, and the next session would translate
  them without knowing it had been decided.
- **Bilingual documents.** Two copies of each rule, which drift apart.

## Consequences

- `CLAUDE.md` points here from its English-first rule.
- `lint:spanish` keeps checking names (identifiers, files and folders) in
  the code folders. It reads neither comments nor the listed documents:
  comments in English stay a review item, as its header says.
- A contributor who does not read Spanish gets everything needed to build,
  test and change the code in English; what stays in Spanish is how the
  owner directs the work.
