---
paths:
  - 'ios/**'
---

# iOS

El detalle está en [CONTRIBUTING.md § iOS](../../CONTRIBUTING.md#ios) y el
mapa de carpetas en [ios/README.md](../../ios/README.md).

**Antes de entregar: `bash ios/scripts/lint.sh` y `xcodebuild test`.**

El flujo `ios` del CI es manual (un minuto de macOS cuenta por diez), así que
la compuerta de rutina es el Mac.

**`swift-format --strict` y SwiftLint estricto, con su versión fijada.**

SwiftLint sigue en 0.x: una versión nueva puede romper sin cambiar el código,
así que se sube a propósito y en su propio PR. Un `swiftlint:disable:next`
nombra la regla y dice por qué.

**Ningún force-unwrap ni `try!` fuera de las pruebas; errores tipados por dominio.**

Un `!` que falla en la captura cierra la app con el gasto a medias.
`guard let … else { preconditionFailure("…") }` cuando el fallo es un error de
programación.

**Todo identificador en inglés, sin excepciones de compatibilidad; el texto que ve la persona, en español.**

Incluye claves de UserDefaults y Keychain, identificadores de tareas,
`kind`s de los widgets y claves JSON en disco.
[ADR 0021](../../docs/adr/0021-ios-english-without-compatibility-exceptions.md).

**Renombrar una propiedad guardada en disco es una migración, no un refactor.**

`StoredFormatTests` fija las claves de la cola, las carpetas y las de
UserDefaults y Keychain: la cola guarda capturas que aún no llegaron a la API.

**Las claves del cable viven en `CodingKeys` y se traducen en el borde; un tipo del disco nunca se codifica tal cual en una petición.**

Así un cambio de contrato no obliga a migrar la cola. `APIKeysTests` las fija.

**La app habla solo con `/api/v2`, y con la web embebida por `cocoSession` (pide la sesión) y `cocoEvents` (avisos sin respuesta).**

La v1 se retiró en 7.10. Un cambio de nombre en el puente rompe la web dentro
de una app instalada antes: se reinstala desde Xcode tras desplegarlo.
`WebBridgeTests` y `bridge.contract.test.ts` fijan los dos lados.

**Estructura por feature: `Coco/Features/<X>`, `Coco/Core` (infraestructura) y `Coco/Shared` (interfaz común); `CocoTests` refleja el mismo árbol.**
