# 0018 — Every screen but the first one loads on demand

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner, step 7.9 of phase 7

## Context and problem statement

The plan's budget for the web is an initial bundle of at most 200 kB gzip.
The 7.1 baseline measured 206 kB (`docs/standards/audit.md`, section 3): one
entry chunk with every screen in it, although a visit only ever paints one of
two things first — the login (drawn by `RequireAuth` in place of `/`) or the
dashboard (the index route).

`tesseract.js` and `pdfjs-dist` were the suspected weight. They are not in the
entry: both are `import()`ed where they are used
(`features/transactions/leer-soporte.ts`, `lib/pdf.ts`) and the built entry
contains neither. Verified on this build.

## Decision

`frontend/src/app/router.tsx` declares the non-initial screens with React
Router's `lazy`: accounts, cost centers, «mi cuenta», registration and the two
administration screens. Each becomes its own chunk, fetched the first time
someone navigates there. The dashboard and the login stay in the entry,
because they are the first paint and a lazy first screen only adds a request
in series before anything is drawn.

The administration screens keep `RequireAdmin` around them: the lazy loader
returns the wrapped element.

## Numbers

Production build (`npm run build --workspace frontend`), measured with
size-limit (`@size-limit/file`, gzip, D26) over exactly what `index.html`
loads: entry script, its stylesheet and the page.

| Initial bundle   | Before    | After     |
| ---------------- | --------- | --------- |
| entry JS (gzip)  | 192.6 kB  | 171.4 kB  |
| size-limit total | 205.56 kB | 184.52 kB |

The largest new chunk is cost centers (17.5 kB gzip).

Lighthouse 13.5.0, mobile, performance only, `scripts/perf/lighthouse.mjs`,
median of 5 runs on `coco_bench` (2,045 movements), same machine and session:

| Page              | Before (scores, median)    | After (scores, median)     |
| ----------------- | -------------------------- | -------------------------- |
| login             | 95 / 95 / 94 / 95 / 94, 95 | 95 / 95 / 95 / 95 / 95, 95 |
| dashboard         | 93 / 94 / 94 / 88 / 88, 93 | 91 / 94 / 92 / 94 / 94, 94 |
| transaction sheet | 83 (all five)              | 83 (all five)              |

The scores barely move: under simulated mobile throttling the first paint is
dominated by the render-blocking Google Fonts stylesheet and the API calls, not
by 21 kB of script. The point of the change is the budget, which it now meets
with 15 kB to spare.

## Consequences

- Good: the initial bundle is under its budget, and size-limit blocks a PR
  that pushes it back over (`.size-limit.cjs`, CI job `verify`).
- Good: a new screen added the same way costs the entry nothing.
- Bad: the first visit to a lazy screen waits for its chunk. On the measured
  build that is one request of 1–18 kB.
- Not solved here: the transaction sheet scores 83 because opening it shifts
  its own panel (CLS 0.199 on `div.fixed > div.flex`). That lives in the
  sheet's components, outside this step; it is pending for the step that owns
  `features/transactions` and `components/panel-inferior.tsx`.
