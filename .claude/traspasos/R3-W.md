# R3-W: correcciones de la web, ronda 3

**Rama** `fix/r3-web` (desde `origin/Dev`). Hallazgos W1, W2, W3, W5 y W6 de `ronda-3-2026-10-10.md`; W4 es de otro ejecutor.

## Hecho

- **W1**: `typedAmount()` (`shared/lib/utils.ts`) convierte el decimal de la API a dígitos con coma y sin `,00`; `initialAmountAndDate` lo usa para el importe y el esperado. Pruebas en `group-thousands.test.ts` (ida y vuelta por `groupThousands`/`digitsOnly`, sin multiplicar) y `transaction-form.test.ts`. `digitsOnly` no cambia: traducir un punto a coma rompería pegar «1.504.200».
- **W2**: `renew()` solo limpia la sesión con `SessionError` 401/403 o cuando no hay token que conservar; en otro fallo (red, 5xx) conserva el token y reprograma con `RENEWAL_RETRY_MS` (5 s, mínimo de `scheduleRenewal`). Prueba nueva `session.dom.test.ts` (navegador; la embebida sigue igual).
- **W3**: `signOutEverywhere` y `changePassword` renuevan si `isTokenExpiring()`. Un `!response.ok` en logout-all (401 incluido) lanza `SessionError` y NO limpia la sesión local: el servidor no cerró nada. La pantalla de cuenta captura el fallo y lo muestra con `ErrorAlert` (antes el botón hacía `void` de la promesa y un fallo pasaba en silencio). Pruebas en `session.dom.test.ts` y `account-page.dom.test.tsx`.
- **W5**: una sola `todayInBogota()` en `shared/lib/format.ts`; la usan `calendar.tsx` (anillo de hoy y mes inicial), `use-range-draft.ts`, `filters.ts`, `transaction-form.ts`, `use-transaction-form.ts` y `pending-payments.tsx`. Pruebas en `format-dates.test.ts` y `calendar.test.tsx` (a las 21:30 de Bogotá el anillo sigue en el día de Bogotá).
- **W6**: `invalidateDerived` invalida `keys.history`; prueba en `query-client.dom.test.ts`.

## Verificación

typecheck, lint (+ `lint:spanish`), prettier, knip, depcruise, unitarias 17+57+500+838, cobertura 72,46 % líneas / 68,84 % ramas, e2e API 326/326 (`coco_e2e_r3w_test`), build, instalación limpia sobre el commit, Playwright 38/38 (puertos 4330/4331, `coco_e2e_pw_r3w_test`).

## Pendiente (fuera del paso)

- `api-client.ts` `withSession`: tras un 401 del servidor, si `renew()` falla por red llama a `discardSession()`. Ahí el token ya fue rechazado, así que no es W2, pero es la misma idea: podría conservar la sesión y reintentar.
- `scripts/verify-clean-install.sh` trabaja en `${TMPDIR:-/tmp}`; si el límite de carpeta aplica también a los scripts, convendría que aceptara un directorio dentro del repo.

## Borrado

Bases locales `coco_e2e_r3w_test` y `coco_e2e_pw_r3w_test` y el clon `cocoApp-work/r3-w` al cerrar. Sin documentos de trabajo que archivar.
