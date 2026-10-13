# 0035 — The CSP's connect-src allows blob: so pdf.js can draw PDF receipts

- Status: accepted
- Date: 2026-10-13
- Deciders: the director, fix `fix/csp-connect-blob-for-pdf-receipts`

## Context and problem statement

The web downloads a receipt with the session token and hands it to pdf.js as
a `blob:` URL. pdf.js 6.2.108 opens `blob:` URLs with XHR (`PDFNetworkStream`),
and the browser governs XHR through `connect-src`. `configureApp` sent
`connect-src 'self'`, which does not match `blob:`, so Chromium blocked the
request and every PDF receipt showed «No se pudo dibujar este PDF.» even
though the file had downloaded. Images were unaffected: `img-src` already
allowed `blob:`.

## Decision

`connect-src` is `'self' blob:`. Nothing else is added: the Have I Been Pwned
lookup stays on the server, and no third-party origin enters the policy.

## Consequences

- PDF receipts draw again; the e2e `security-headers` spec pins
  `connect-src 'self' blob:` and nothing more.
- A `blob:` URL only points at data the page already holds (same origin), so
  it opens nothing outward; the exfiltration surface of `connect-src` is
  unchanged.
- Any later origin in `connect-src` needs its own ADR.
