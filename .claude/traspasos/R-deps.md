# R-deps — parches de seguridad de dependencias

**Hecho** (PR #79, desplegado `dbfaff0`; `sharp` 0.35.5 ya había entrado con el #78):

- `js-yaml` 5.3.0 → 5.4.1 bajo `@nestjs/swagger` (GHSA-r3ph-w7gj-g6xm), único cambio que corre en la API. OpenAPI regenerado sin diferencias.
- `brace-expansion` 1.1.18 → 1.1.21 (jest, dev) y `undici` fijo en 7.29.1 (jsdom/orval, dev). `overrides` en la raíz: `"@nestjs/swagger": {"js-yaml"}`, `"brace-expansion@1"`, `"undici@7"`, acotados por padre o por mayor.
- `scripts/ci/audit.mjs`: excepciones de Prisma (`deepmerge-ts`, `mysql2`) revisadas el 2026-10-06 sobre prisma 7.10.0 (sigue fijándolas; 8 solo en rc). Falso positivo documentado: esbuild GHSA-gv7w-rqvm-qjhr, RETIRADO el 2026-06-17.
- Runbook, sección nueva «Dependency vulnerabilities»: la compuerta es `audit.mjs` (solo producción); los correos de Hostinger escanean también desarrollo y avisos retirados; qué hacer al recibir uno; la trampa de `overrides`.

**Decisión / trampa**: npm 11 con lockfile existente IGNORA un override nuevo sobre una dependencia fijada (swagger fija `js-yaml` 5.3.0 exacto). Se escribió 5.4.1 a mano en esa entrada del lock (`version`, `resolved`, `integrity`) y se comprobó con `npm ci`, `npm install` y una instalación de producción en limpio. En workspaces `npm ls` lo marca `invalid`: bug de npm, no árbol roto (`npm ls esbuild` sigue saliendo 0). Borrar entradas del lock para forzar la resolución rompe el árbol: no hacerlo.

**Verificación**: typecheck, lint, prettier, knip, unitarias, e2e API 303/303 (`coco_e2e_deps_test`, `coco_app`), Playwright 26/26 (`coco_e2e_deps_pw_test`), build, instalación limpia (una sola esbuild 0.25.12), `audit.mjs` verde. Despliegue: `/api/v2/health` = `dbfaff0`, `/ready` 200, web 200; registro de hbuilds con un solo «Running npm install» y «Deployment completed in 2m 13s».

**Pendiente**:

- `@nestjs/swagger` 12.0.1+ ya trae `js-yaml` 5.4.1: al subir a Nest 12, quitar el override y el parche del lock.
- Avisos de desarrollo sin arreglo que siguen en `npm audit` completo: `braces` ≤3.0.3 (GHSA-vfj7-8cjw-p6xm, vía micromatch/jest) y `sprintf-js` (moderado). Se van con jest 30 o con vitest en la API.
- Quitar las excepciones de Prisma cuando salga una estable con `deepmerge-ts` 8 y `mysql2` ≥3.24.

**Borrado**: el env temporal de Playwright del scratchpad. Quedan las bases locales `coco_e2e_deps_test` y `coco_e2e_deps_pw_test` (se pueden tirar).
