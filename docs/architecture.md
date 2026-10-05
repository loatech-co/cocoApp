# Coco architecture

Coco is a personal-finance ledger: transactions are the core, and balances,
budgets, debts and goals are derived from them, never stored. It is a
modular monolith — one NestJS process serving the API and the web build —
with PostgreSQL, Auth and receipt storage on Supabase, and two clients: the
web app and a hybrid iOS app. How to run it is in the [README](../README.md);
how to operate it, in the [runbook](runbook.md).

## Context (C4 level 1)

```mermaid
C4Context
  title Coco — system context
  Person(owner, "User", "Records and reviews their money")
  System(coco, "Coco", "Ledger, budgets, receipts")
  System_Ext(supabase, "Supabase", "PostgreSQL, Auth (GoTrue), Storage")
  System_Ext(apple, "iOS: Wallet and Messages", "Shortcuts automations")
  System_Ext(github, "GitHub", "Repository, Actions CI")
  System_Ext(hostinger, "Hostinger", "Node.js app hosting, hbuilds")

  Rel(owner, coco, "Uses", "browser, iPhone")
  Rel(apple, coco, "Sends card payments and bank SMS", "App Intents")
  Rel(coco, supabase, "Stores data, verifies identity, keeps receipts", "TLS")
  Rel(github, hostinger, "Push to Dev triggers build and deploy")
  Rel(hostinger, coco, "Runs")
```

## Containers (C4 level 2)

```mermaid
C4Container
  title Coco — containers
  Person(user, "User")

  Container_Boundary(device, "User's devices") {
    Container(web, "Web app", "React 19, Vite, TypeScript", "SPA; reads receipts in the browser (pdf.js, Tesseract)")
    Container(ios, "iOS app", "SwiftUI + WKWebView", "Native capture, offline queue, intents; the web for the rest")
  }

  Container_Boundary(host, "Hostinger Node.js app") {
    Container(api, "API", "NestJS 11, Prisma", "/api/v1; serves the web build; one module per resource")
    Container(lectura, "@coco/lectura", "TypeScript package", "Pure reading and classification engine")
  }

  ContainerDb(db, "Database", "PostgreSQL on Supabase", "All rows scoped by user_id")
  Container_Ext(auth, "Supabase Auth", "GoTrue", "Credentials, ES256 tokens, JWKS")
  Container_Ext(bucket, "Storage bucket soportes", "Supabase Storage", "Private receipt files")

  Rel(user, web, "Uses")
  Rel(user, ios, "Uses")
  Rel(web, api, "JSON over HTTPS", "refresh token in httpOnly cookie")
  Rel(ios, api, "JSON over HTTPS", "bearer token from keychain")
  Rel(ios, web, "Embeds; hands it the session over a bridge")
  Rel(api, lectura, "Calls in-process")
  Rel(api, db, "Prisma", "pooler 6543")
  Rel(api, auth, "Sign-in, refresh; verifies against JWKS")
  Rel(api, bucket, "Uploads and signs receipt reads")
```

The browser never talks to Supabase: every call goes through the API, which
derives `user_id` from the verified token on every request.

## Main flows

### Manual registration (web or iOS form)

```mermaid
sequenceDiagram
  actor U as User
  participant C as Web / iOS form
  participant A as API
  participant D as Database
  U->>C: Types amount, picks a concept (search over the whole tree)
  C->>A: GET /categorization/suggest (description, debounced)
  A-->>C: Suggestion, marked and editable
  U->>C: Saves
  C->>A: POST /transactions
  A->>D: Insert (scoped by user_id)
  C->>A: POST /categorization/learn (accepted or corrected)
  A->>D: Upsert category rule
```

### With a photo or a file

```mermaid
sequenceDiagram
  actor U as User
  participant C as Web / iOS
  participant A as API
  participant L as @coco/lectura
  participant S as Bucket soportes
  U->>C: Takes a photo or attaches a PDF
  C->>C: Text from pixels (pdf.js / Tesseract / iOS Vision)
  C->>A: POST /transactions/interpret (text)
  A->>L: interpretar(text, tree, history)
  L-->>A: Amount, date, merchant, concept, certainty
  A-->>C: Proposal to review
  U->>C: Confirms or corrects
  C->>A: POST /transactions
  C->>A: POST /transactions/:id/soportes (file)
  A->>S: Store under a private key, sha256 recorded
```

### Wallet and SMS (iOS automations)

```mermaid
sequenceDiagram
  participant W as Wallet / Messages
  participant I as iOS intent
  participant Q as On-device queue
  participant A as API
  participant L as @coco/lectura
  participant D as Database
  W->>I: Card payment or bank SMS (Shortcuts automation)
  I->>Q: Persist with a new UUID external_ref
  Q->>A: POST /transactions/capture (text, source, external_ref)
  A->>L: interpretar()
  A->>D: Insert, or return the existing row on (user_id, external_ref)
  A->>D: Merge Wallet and SMS of the same purchase within 10 minutes
  A-->>Q: 200 with repetido / fusionado
  Note over Q,A: Retries with backoff until 200; a repeat never duplicates
```

Low-certainty or amount-less captures are saved with `por_revisar` so a person
looks at them; nothing is filed silently.

## Key decisions

| Decision                                                  | ADR                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Modular monolith; modules talk only through services      | [0001](adr/0001-modular-monolith.md)                                                    |
| Portable-first stack on a zero-cost host                  | [0002](adr/0002-portable-first-stack.md)                                                |
| PostgreSQL and identity on Supabase; the API is the door  | [0003](adr/0003-postgres-and-auth-on-supabase.md)                                       |
| One reading engine, run by the API                        | [0004](adr/0004-reading-engine-in-the-api.md)                                           |
| Idempotent writes by `external_ref`                       | [0005](adr/0005-idempotency-by-external-ref.md)                                         |
| Hybrid iOS app with one session                           | [0006](adr/0006-hybrid-ios-app.md)                                                      |
| Supabase data API closed by a script after each migration | [0007](adr/0007-close-supabase-data-api-by-script.md)                                   |
| Additive migrations; expand and contract                  | [0008](adr/0008-expand-and-contract-migrations.md)                                      |
| Trunk-based; `Dev` deploys, only through `merge.sh`       | [0009](adr/0009-trunk-based-with-dev-as-deploy-branch.md)                               |
| Row-level security with an application role (proposed)    | [0010](adr/0010-rls-with-application-role.md)                                           |
| Phase 7 tooling changes                                   | [0011](adr/0011-i18next-no-literal-string.md)–[0016](adr/0016-lighthouse-cli-script.md) |
