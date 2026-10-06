# 0024 — The text catalog loads beside the entry, awaited before anything renders

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner, step 7.3 of phase 7

## Context and problem statement

Step 7.3 moves every user-facing text of the web to
`frontend/src/locales/es.json`, read through react-i18next with typed
resources (D5). The initial bundle has a blocking budget of 200 kB gzip
(ADR 0018, `.size-limit.cjs`). Before this step it measured **193.55 kB**:
6.45 kB of room.

Measured on this branch: i18next + react-i18next weigh 19.5 kB gzip bundled
together, and the catalog (≈690 texts) 9.3 kB. Imported statically, the three
go into the entry and the budget breaks by more than 20 kB.

The texts are needed for the first paint, and a third of them are not in
components: option lists built at module level (`TIPOS`, `PRESETS`,
`SORT_ORDERS`), error messages of the API client, labels built in `model/`.
Whatever loads the catalog later has to guarantee none of that runs first.

## Decision

`shared/lib/i18n.ts` loads i18next, react-i18next and the catalog with
`import()` and awaits them **at the top level** of the module, then exports a
typed `t`. ES module semantics do the rest: no module that imports `i18n.ts`
(directly or not) is evaluated until that `await` resolves, so the router,
every screen and every module-level constant built with `t` run with the
catalog already there. Vite puts the three in their own chunks.

Top-level await needs a newer build target than Vite's default (Safari 14):
`vite.config.ts` sets `es2022` / Chrome 89 / Firefox 89 / Safari 15. The iOS
app's WebView (iOS 17) and every evergreen browser are past it.

Components use the module `t` rather than `useTranslation()`: one function
serves the texts inside and outside React, and with a single language there
is no change of language to re-render for. react-i18next is registered
(`initReactI18next`) so `Trans` is available for a sentence with an element
inside.

## Consequences

- The initial bundle went **down**, to **193.37 kB** (from 193.55): the
  `es2022` target down-levels less, which more than pays for the loader.
- The first paint waits for one more request (the three chunks, ≈35 kB gzip
  together, fetched in parallel right after the entry starts evaluating). On
  a phone that is one round trip; there is no flash of untranslated text
  because nothing renders before it.
- A second language would be a second JSON and a `lng` choice in `i18n.ts`;
  nothing else changes.

## Alternatives considered

- **Catalog and i18next in the entry.** Breaks the budget (≈222 kB).
- **Lazy-load the app itself after the catalog** (`main.tsx` awaits the
  catalog, then `import()`s the router). Same effect at run time, but it moves
  the whole app out of what `.size-limit.cjs` measures: the budget would pass
  by no longer measuring the thing it exists for.
- **A hand-written `t` over the JSON, without i18next.** Smaller, but D5 names
  react-i18next as the consumer, and interpolation, escaping and `Trans` would
  have to be rewritten and tested here.
