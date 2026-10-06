# R-ios: los «Corregir YA» de iOS de la revisión externa (rama `fix/ios-hardening`)

**Hecho**

- Cancelación: `CaptureQueue.process` cancela con `withTaskCancellationHandler` y un plazo igual al presupuesto (corta la petición en vuelo); quien se suma a una corrida en marcha espera solo SU presupuesto (`value(of:within:)`). `QueuedCapturer` descuenta lo que tardó el disco. `APIError.cancelled` no cuenta como intento. BGTask: el `expirationHandler` cancela y la cancelación llega a la cola.
- Errores: sin `try?` en el disco de la cola; `AppLog.queue` registra paso (`DiskStep`) y tipo de error; `QueueSnapshot.diskError` y la insignia conserva lo último leído. Sin respaldo en `temporaryDirectory` (cola y árbol en `Application Support`; la carpeta nueva se excluye de iCloud).
- `APIError.unreadableSuccess`: un 2xx ilegible deja la captura en `.unconfirmed` («Por revisar», botón «Ya lo revisé»), nunca se reintenta ni se purga; en la foto cuenta como hecha. `CaptureResult.unconfirmed` y su diálogo en Atajos.
- `PendingCapture.version` (1). Corrupto o versión desconocida → `Queue/Quarantine`, intacto; Capturas muestra «N capturas no se pudieron leer».
- Swift 6 (`SWIFT_VERSION 6.0`), 0 avisos. `InMemoryKeychain` pasa a `CocoTests`; los `@unchecked Sendable` que quedan (dobles de prueba y `BGTask`) llevan su motivo.
- Correo fuera del log de sesión (`Dependencies.name(from:)`).
- Petición del director: `WebNotice` envía `capturado` (al `captureSaved`) y `primerPlano` (al volver a primer plano y al volver a la pestaña Inicio) con `?.` doble; `ContractsTests` los compara con `AvisosDeLaApp` si la web ya los declara.
- Hook `pre-push` `ios` (`ios/scripts/pre-push.sh`): swift-format estricto + `xcodebuild test`, solo con cambios en `ios/`, avisa sin Xcode. Probado en el push de esta rama (230 pruebas, 48 s).
- Verificación: xcodebuild 230 (228 pasan, 2 saltadas de siempre), swift-format y SwiftLint limpios, `xcodegen` sin diferencias; npm typecheck, lint, prettier, knip, test, e2e api 278, build y clean-install en verde.

**Decisiones**

- Archivo sin `version` = versión desconocida → cuarentena (ADR 0002: la app no está instalada).
- `CaptureQueue` partido en tres archivos (`+Actions`, `CaptureQueueTypes`); `store`, `clock` y los ayudantes de disco pasan a `internal` para las extensiones.

**Pendiente**

- PR sin integrar (lo integra el director). `capturado` solo surte efecto cuando entre #51.
- «Puede esperar» de la revisión: errores del Keychain que cierran sesión, origen del documento al inyectar el token, Swift Testing.
- Base local `coco_e2e_rios_test` creada para las e2e; borrarla es decisión del director.

**Borrado**: nada.
