# Traspaso — R-web, «Corregir YA» del frontend (rama `fix/web-query-hardening`, sobre #44)

**Hecho** (los cuatro puntos del informe, confirmados contra la base: `refetchOnWindowFocus: false`, `retry: 1`, `salir()` sin `clear()`, centros con «vacío» ante un error)

- `shared/api/query-client.ts`: `createQueryClient` (foco del navegador encendido, `staleTime` 30 s), `shouldRetry` (un reintento solo para red y 5xx; ningún 4xx), `refocus` (pulso de `focusManager`) y `clearCacheOnUserChange` (vacía la caché al salir o al entrar otra cuenta; escucha la sesión, así cubre salir, cerrar todo, cambiar contraseña, `sesionCerrada` y el 401).
- Puente: `AvisosDeLaApp` en `native-contract.ts` con `capturado()` y `primerPlano()`, publicados en `window.__coco` (`native-bridge.ts`). `capturado` invalida movimientos, cuentas y resumen (`invalidateDerived` en `query-keys.ts`).
- `ErrorAlert` ante `isError` en centros, cuentas, tabla del resumen, búsqueda, el conteo de «Eliminar categoría» (además bloquea confirmar: sin conteo, borrar dejaría movimientos sin clasificar) y Ajustes.
- Pruebas: `query-client.dom.test.ts`, `centros-page.dom.test.tsx`, `accounts-page.dom.test.tsx`, `puente-nativo.test.ts`.
- Verificación: typecheck, lint, prettier, knip, unitarias (776 web), e2e API 278 (`coco_e2e_wq_test`), build, Playwright 26/26 (`coco_e2e_wqpw_test`, puerto 4330), instalación limpia.

**Pendiente**

- **iOS** (otro paso): tras un 2xx de `/captura` (o al vaciar la cola), `evaluateJavaScript("window.__coco?.capturado()")`; al volver a primer plano (`scenePhase == .active`, o al reaparecer la pestaña del webview), `window.__coco?.primerPlano()`. Siempre con `?.`: sin sesión no hay `__coco`. `ContratosTests` puede comprobar los dos nombres en `native-contract.ts`.
- Soportes de un movimiento (`useSupportFiles`): una lista que falla se ve como «sin soportes». Tiene su propio modelo de fallos (`FalloDeSoporte`); no lo toqué.
- Admin (usuarios, bitácora) ya distinguía el error, con `Alert` propio en vez de `ErrorAlert`.
- Si R-2-v2 renombra `ApiClientError.status`, `shouldRetry` es el único sitio de esta rama que lo lee.

**Decisiones**: vaciar por suscripción a la sesión y no dentro de `salir()` (un solo sitio para todas las salidas). Textos de error fijos por pantalla, sin leer el cuerpo del error (no depende del lector que cambia R-2-v2).

**Borrado**: nada que borrar. Quedan las bases `coco_e2e_wq_test` y `coco_e2e_wqpw_test` y `api/.env.test` (ignorado) en el worktree.
