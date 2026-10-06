# R-ios-errors: iOS lee los errores `problem+json` de la v2 (rama `feat/ios-problem-codes`)

Sale de `fix/ios-hardening` (#52). Solo toca `ios/`. PR contra `Dev`, sin integrar: va detrás del #52 y del #53.

**Hecho**

- `APIProblem` (`Core/Networking/APIProblem.swift`): status, `ProblemCode`, title, detail y `errors` por campo. Lee las DOS formas: `problem+json` (con `code` arriba) y la vieja `{error:{code,message}}`. Lo que no es ninguna (HTML de un proxy, vacío) da `nil` y cae por status: 5xx reintenta, 4xx es `unreadableResponse` (genérico), 401 renueva.
- `ProblemCode`: los códigos sobre los que la app decide, más `.other(String)` para los desconocidos y los de la v1.
- `APIError.from(status:body:)` decide por `code` y luego por status. Casos nuevos: `.sessionRevoked`, `.duplicate(APIProblem)`; `.rejected` ahora lleva el `APIProblem`.
- Cola: validación y demás 4xx → `.failed` visible con `userMessage()`, sin reintentar; `session_expired`/`invalid_token`/`unauthenticated` → una renovación; `session_revoked` → `session.discard()` y `.awaitingSession`, sin renovar; 429/503/5xx → espera creciente (`Retry`); `duplicate` → hecha (`alreadyRegistered`). `NativeSession.refresh` cierra también con `.sessionRevoked`.
- Textos propios en el catálogo (`problem.*`): sesión vencida, cerrada en otro lugar, cuenta pendiente de aprobación, suspendida, no habilitada. Lo demás muestra el `detail` de la API. `SignInView` usa lo mismo.
- Pruebas: `APIProblemTests` (lectura de las dos formas, HTML, cada familia por el cliente) y `CaptureQueueProblemTests` (cada familia en la cola). Línea base de localización con las 5 claves.
- Verificación: xcodebuild 248 (246 pasan, 2 saltadas de siempre), swift-format y SwiftLint limpios, xcodegen regenerado; npm typecheck, lint, prettier, knip, test, e2e api 278, build y clean-install en verde.

**Decisiones**

- `invalid_credentials` y `wrong_current_password` son 401 pero no de sesión: van a `.rejected` (renovar no los arregla).
- `duplicate` en la fase de texto sin resultado previo termina con `transactionId: 0` y borra la foto pendiente (no hay a qué adjuntarla); si ya había resultado de texto, se conserva.

**Pendiente**

- Contrato: la v2 solo responde `problem+json` cuando el #53 esté DESPLEGADO. Hasta entonces producción manda `{error:…}` y se lee por la forma vieja; quitar esa rama cuando la v1 desaparezca.
- Aprovechar `errors` por campo en el formulario (hoy solo se decodifican).
- Base local `coco_e2e_rios_test` reutilizada para las e2e; borrarla es decisión del director.

**Borrado**: nada.
