# R2-A — seguridad, CI y servidor de la segunda revisión

PR #126 (`fix/r2a-security-ci-server`), integrado con `merge.sh`.

Hecho:

- #20: el respaldo de la SPA ya no contesta `/problems/*`, `/openapi.v2.json`
  ni `/assets/*` que no existe: 404 `problem+json` (`NOT_SPA_ROUTES`,
  `spa.module.ts`). `Permissions-Policy` mínima en `bootstrap.ts` (cámara y
  portapapeles solo propios). La app emite UNA CSP; la segunda en producción
  la pone LiteSpeed (Force HTTPS de hPanel) y quedó como acción del dueño en
  el runbook («Hosting traps»). e2e nueva: `spa-fallback.e2e-spec.ts`.
- Hallazgo de paso: en las e2e la SPA nunca se servía (`Test.createTestingModule`
  resuelve el cargador de `ServeStaticModule` antes del adaptador y elige el
  nulo). `startApp` fuerza el `ExpressLoader`.
- #19: gitleaks y SwiftLint se verifican por sha256 (`ci.yml`). Subir la
  versión de SwiftLint en `.swiftlint.yml` obliga a cambiar el sha256.
- N3: `lint:spanish` corre en `hygiene` cuando `code` es falso (PR solo iOS).
- N8: `scripts/prepare-tesseract.mjs` dispara `clean-install`.
- N9: `merge.sh` rechaza un PR con base distinta de `DEPLOY_BRANCH` y exige
  `ci/hygiene` en `pass` (`REQUIRED_CHECKS`). Probado en el PR #126: con
  `DEPLOY_BRANCH=main` y con un check inexistente, rechaza.
- N2 y #15: `ios/README.md` arranca contra `dev:auth` y `admin@local.coco`;
  los contratos son espejo de `api/openapi.v2.json`.

Producción: health y ready 200, las rutas dan 404 problem+json, la SPA y los
bundles siguen sirviendo, `permissions-policy` presente.

Pendiente (dueño): quitar la CSP de LiteSpeed sin perder la redirección a HTTPS.
Borrado: `coco_e2e_r2a_test` y el `api/.env.test` local.
