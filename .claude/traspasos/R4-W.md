# R4-W: correcciones de la web, ronda 4

**Rama** `fix/r4-web` (desde `origin/Dev`). Hallazgos W1–W4 de `ronda-4-2026-10-11.md`; W5 (`texto-embebido`, expandir y contraer con la API y el parser) es de otro paso.

## Hecho

- **W1**: `withSession` ya no descarta la sesión por cualquier `renew()` en falso. Nueva `renewAfterRejection()`: si `renew()` renueva, reintenta; si no y `currentToken()` es `null` (el servidor rechazó el refresh; `renew()` ya limpió), lanza 401 `unauthenticated`; si el token sigue (red, 5xx), lanza `ApiClientError(0, 'network_error')` sin tocar la sesión. No se cambió la firma de `renew()`: el motivo ya está en el estado que deja.
- **W2**: `apiUpload` separa el XHR en `upload()` (resuelve `{status, body}`, rechaza solo por red) y en 401 renueva una vez y reenvía con el token nuevo; un segundo 401 sí descarta. `errorFrom` (segundo 401 de `apiRequest`) sigue descartando: la sesión murió de verdad.
- Prueba nueva `api-client.dom.test.ts` (7 casos: renovado → reintento con bearer nuevo; rechazado → sesión fuera; red → sesión intacta y `network_error`; lo mismo para `apiUpload` con un `XMLHttpRequest` falso, más el segundo 401 final). Contra el cliente viejo fallan exactamente los tres de W1/W2.
- **W3**: `sidenav-storage.ts` envuelve lectura y escritura en `try/catch`; bloqueado = «expandida». Prueba con `Storage.prototype.getItem/setItem` lanzando `SecurityError`.
- **W4**: `spanish-markup.ts` lee el lado derecho de `dataset.x = …` (`BinaryExpression` con `=`) y el primer argumento de `getItem`/`setItem`/`removeItem` (`STORAGE_CALLS`). `LEGACY_STORAGE_KEYS` exime `sidenav-plegada` (con razón, hasta 7.10); sin ella la prueba de migración quedaba marcada. Sondas con `abierto`, `clave-guardada`, `otra-clave`, `vieja-clave`: las cuatro detectadas, `sidenav-plegada` no; retiradas.

## Verificación

typecheck, lint (+ `lint:spanish`), prettier, knip, depcruise, unitarias 17+57+847+11, cobertura web 73,3 % líneas / 69,3 % ramas, e2e API 339/339 (`coco_e2e_r4w_test`), build, instalación limpia, Playwright 38/38 (puertos 4350/4351, `coco_e2e_pw_r4w_test`).

## Pendiente (fuera del paso)

- W5: `'texto-embebido'` → `'embedded-text'` en `read-receipt.ts`, `classify.ts` y la API a la vez.
- ~~`session.ts` tiene 383 líneas (límite 300); no se tocó para no crecer el paso.~~ Falsa alarma (ronda 5, W4): `max-lines` descuenta blancos y comentarios y quedan 190 efectivas.
- `npm test -- --coverage` no produce cobertura (los args van al `node --test` final); se usó `test:coverage --workspace frontend`.

## Borrado

Bases locales `coco_e2e_r4w_test` y `coco_e2e_pw_r4w_test` y el clon `cocoApp-work/r4-w` al cerrar. Sin documentos de trabajo que archivar.
