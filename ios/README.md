# Coco para iPhone

La app del teléfono de Coco. Es híbrida: lo que se hace con una mano en diez
segundos —anotar un gasto, fotografiar un recibo, recibir lo que Wallet o un
SMS traen— es SwiftUI nativo; todo lo demás es la misma web, dentro de un
`WKWebView`, con UNA sola sesión que la app administra.

**Primera línea, y la más importante:** `xcodegen generate` PISA el
`.xcodeproj`. Lo que no esté en `project.yml` —fuentes, Info.plist, targets,
settings— se pierde. Nunca se edita el proyecto a mano.

## Qué hay en cada carpeta

Por feature: cada carpeta de `Features/` tiene todo lo de una cosa que la
persona hace. Lo que usan varias features sin ser de ninguna va a `Core/`
(infraestructura) o a `Shared/` (piezas comunes de la interfaz y formatos).

| Carpeta | Qué es |
|---|---|
| `Coco/App` | Arranque, composición (`Dependencies`), navegación híbrida (`Router`, `RootView`) |
| `Coco/Features/Capture` | Formulario rápido, cámara, lectura del recibo (Vision), lista de capturas |
| `Coco/Features/Capture/Queue` | Capturas pendientes en disco, reintentos, envío en dos fases |
| `Coco/Features/Session` | La sesión nativa (refresh en el Keychain, access en memoria, single-flight) y entrar |
| `Coco/Features/Web` | El `WKWebView` único y el puente `cocoSesion` |
| `Coco/Features/CategoryTree` | El árbol de categorías guardado en el teléfono y su buscador |
| `Coco/Features/Shortcuts` | Las acciones de Atajos (App Intents) y el `AppShortcutsProvider` |
| `Coco/Features/Reminders` | Notificaciones locales y el aviso de que la firma caduca |
| `Coco/Features/Onboarding` | La guía para crear las dos automatizaciones de Atajos |
| `Coco/Features/Settings` | Más y Ajustes |
| `Coco/Core/Networking` | `APIClient`, peticiones, errores tipados, contratos (espejo de `@coco/types`) y `Connectivity` |
| `Coco/Core/Storage` | Lo que se guarda en disco: la cola y el árbol |
| `Coco/Core/Keychain` | El Keychain del sistema y su doble en memoria |
| `Coco/Core/Background` | `BGTaskScheduler`: renovar el token y vaciar la cola |
| `Coco/Core/Domain` | El cuerpo de una captura, los montos y los protocolos que cruzan features |
| `Coco/Core/Logging` | `AppLog` (`os.Logger`) |
| `Coco/Shared` | Fecha de Bogotá, pesos, la marca y la pantalla sin conexión |
| `CocoWidgets` | Extensión de WidgetKit: control (iOS 18) y widget (iOS 17) |
| `CocoTests` | Pruebas XCTest, con la misma estructura que `Coco/`; los dobles en `Support/` |

## Convenciones

Las reglas completas están en `CONTRIBUTING.md`, sección «iOS». En corto:

- **Formato:** `swift-format` (viene con Xcode) con `.swift-format`. **Reglas:**
  SwiftLint estricto con `.swiftlint.yml`, versión fijada. Los dos corren con
  `bash scripts/lint.sh`, en el `pre-commit` y en el workflow `ios`.
- **Todo identificador en inglés**: archivos, tipos, miembros, los App
  Intents y sus `@Parameter`, el target `CocoWidgets`, los `kind`, las tareas
  de fondo, las claves de UserDefaults y Keychain, las carpetas y las claves
  de lo que se guarda en disco (ADR 0002). **Lo que ve la persona, en
  español**, incluidas las frases y los títulos de Atajos y Siri.
- **La app habla solo con la `/api/v2`.** Sus claves JSON están en los
  `CodingKeys` y, para lo que se manda, en `CaptureRequest` e
  `InterpretRequest`. `APIKeysTests` falla si una cambia. `CaptureBody` es
  de la app: se guarda en la cola con sus claves y se traduce al enviar.
- **Lo único en español que no es texto de usuario** es contrato con algo de
  fuera y no se toca desde aquí: los nombres de los mensajes del puente con la
  web y las claves del perfil que el puente le entrega
  (`WebSession.webProfileKeys`), que define el frontend mientras siga en la
  `v1`.
- **Lo guardado en disco** usa las claves sintetizadas (los nombres de las
  propiedades). `StoredFormatTests` las fija, junto con las carpetas, las
  claves de UserDefaults y Keychain y las tareas de fondo: renombrar una
  propiedad guardada es una migración, no un refactor.
- **Textos en el catálogo.** Lo que ve la persona vive en
  `Coco/Resources/Localizable.xcstrings` (y en el de `CocoWidgets/`, que no
  ve los recursos del .app), con clave en inglés (`capture.form.amount`) y
  valor en español, y se pide con `L10n` (`L10n.Capture.formAmount`). Un
  texto nuevo se añade al catálogo, a `L10n` y a
  `CocoTests/Support/localization-baseline.json`. `VisibleTextTests` falla si
  una vista escribe un texto suelto; sus excepciones —los títulos y
  parámetros de los App Intents, cabeceras HTTP, mensajes del registro— van
  en una lista, cada una con su motivo. Xcode no extrae textos solo
  (`SWIFT_EMIT_LOC_STRINGS: NO`): el catálogo se escribe a mano.
- **Red con `async/await`**, sin callbacks. Errores tipados por dominio
  (`APIError`, `SessionError`, `QueueError`, `KeychainError`,
  `ParameterError`).
- **Sin `!`** (force-unwrap) ni `try!` fuera de las pruebas: SwiftLint lo
  impide.

## Requisitos

- macOS con Xcode 16 o superior. Probado con Xcode 27.0 / iOS 27 / Swift 6.4
  en modo de lenguaje 5.10 (`SWIFT_VERSION` en `project.yml`).
- `brew install xcodegen swiftlint` (SwiftLint en la versión de
  `swiftlint_version` en `.swiftlint.yml`; con otra, el hook avisa y la salta).
- Node, para correr la API local.

## Correr en el simulador

```sh
cd ios
xcodegen generate
xcodebuild -scheme Coco -destination 'platform=iOS Simulator,name=iPhone 17' build test
```

El nombre del simulador se comprueba con `xcrun simctl list devices available`.
Para trabajar con la interfaz: abrir `Coco.xcodeproj`, elegir iPhone 17, Run.

## Apuntar a la API local (cambiar la URL de la API)

La app lee `CocoAPIBaseURL` de su Info.plist. `project.yml` lo escribe como
`$(COCO_API_BASE_URL)`, un build setting cuyo valor base es
`https://dev-cocoapp.viteri.me`. Hay dos formas de cambiarla:

- **Sin recompilar:** Más → Ajustes → URL de la API (también desde la rueda
  de la ficha de entrar) → por ejemplo `http://localhost:3000`. Se valida
  (solo `http(s)://host[:puerto]`, sin ruta), se guarda en UserDefaults y manda
  sobre el plist; guardar cierra la sesión y la nueva URL se usa al volver a
  abrir la app del todo (las piezas de red se componen una vez al arrancar).
  «Restablecer» vuelve al valor del bundle.
- **Al compilar** (lo que usa el humo): pisar el build setting en la línea
  de órdenes, sin tocar ningún archivo:

  ```sh
  xcodebuild -scheme Coco -destination 'platform=iOS Simulator,name=iPhone 17' \
    CODE_SIGNING_ALLOWED=NO COCO_API_BASE_URL=http://localhost:3000 \
    -derivedDataPath /tmp/dd-coco build
  ```

La API local arranca contra cocoApp-dev con `PERMITIR_AUTH_DESTRUCTIVA=si`
solo en local. ATS permite red local sin TLS únicamente por
`NSAllowsLocalNetworking`; cualquier otro host sigue exigiendo HTTPS. El
usuario de desarrollo y su contraseña están en `api/.env.supabase-dev` (nunca
en git).

## Humo en el simulador contra la API local

1. API: `cd api && npm run start` (usa `api/.env`: Postgres local en 5432,
   Supabase dev, puerto 3000). Sirve la SPA desde `frontend/dist` si existe
   (`npm run build` en `frontend` si no). Comprobar: `curl -s -o /dev/null -w
   '%{http_code}' http://localhost:3000/` → 200.
2. Simulador y app:

   ```sh
   cd ios && xcodegen generate -q
   xcrun simctl boot "iPhone 17"
   xcodebuild -scheme Coco -destination 'platform=iOS Simulator,name=iPhone 17' \
     CODE_SIGNING_ALLOWED=NO COCO_API_BASE_URL=http://localhost:3000 \
     -derivedDataPath /tmp/dd-coco build
   xcrun simctl install booted /tmp/dd-coco/Build/Products/Debug-iphonesimulator/Coco.app
   xcrun simctl launch booted co.loatech.coco
   ```

3. Bitácora de la app (subsistema `co.loatech.coco`, categorías `app`,
   `navigation`, `session`). En zsh `log` es un builtin: usar la ruta entera.

   ```sh
   /usr/bin/log stream --info --predicate 'subsystem == "co.loatech.coco"' --style compact
   ```

4. Entrar con el usuario de `api/.env.supabase-dev`. Después: Inicio carga la
   web sin techo ni barra; Registrar guarda con la API apagada y Capturas
   enseña «1 pendiente»; Más → Centros de costos abre la ruta en el mismo
   webview; Más → Cerrar sesión vuelve a la ficha de entrar.
5. Deep links: `xcrun simctl openurl booted coco://capture/manual` (o
   `coco://capture/photo`, `coco://captures`). iOS pregunta «¿Abrir en Coco?»
   la primera vez que una URL `coco://` llega desde fuera de la app: hay que
   tocar «Abrir». En la bitácora aparece `onOpenURL coco://…` y `ir
   formularioRapido(...)`.
6. Capturas: `xcrun simctl io booted screenshot ruta.png`.
7. Apagar: `pkill -f "nest start"`, `xcrun simctl shutdown "iPhone 17"`.

Avisos del humo en Xcode 27: la ventana del simulador la dibuja
`DeviceHub.app` (en `Xcode.app/Contents/Applications`), y cerrarla APAGA el
dispositivo. macOS no trae `timeout`: para acotar la API en el tiempo sirve
`perl -e 'alarm 900; exec @ARGV' npm run start`.

## Instalar en el teléfono con una cuenta gratuita

1. Xcode → Settings → Accounts → añadir el Apple ID (aparece como «Personal
   Team»).
2. `cp Local.xcconfig.example Local.xcconfig` y poner ahí tu Team ID (lo ves
   en Xcode → Settings → Accounts → tu equipo). Si Xcode ya estaba abierto,
   regenerar con `xcodegen generate` o cerrar y abrir el proyecto. Los tres
   targets (Coco, CocoWidgets, CocoTests) lo heredan; no hace falta tocar
   Signing & Capabilities. `Local.xcconfig` está en `.gitignore`: el equipo
   no se versiona ni vive en `project.yml`, y por eso `xcodegen generate`
   no lo borra. (Elegir el equipo a mano en Xcode también funciona, pero se
   pierde con el siguiente `xcodegen generate`.)
3. Conectar el iPhone con cable, confiar en el Mac, elegirlo como destino,
   Run.
4. En el iPhone: Ajustes → General → VPN y gestión de dispositivos → confiar
   en el desarrollador. Activar el modo de desarrollador si iOS lo pide.

## Renovación cada 7 días y límites del equipo personal

El certificado de un equipo personal caduca a los 7 días y la app deja de
abrir. La app lee la fecha del perfil embebido (`embedded.mobileprovision`),
avisa con una notificación un día antes y enseña los días que quedan en
Ajustes. Renovar es conectar el cable y pulsar Run otra vez: la cola, el
Keychain y los ajustes sobreviven porque el bundle id no cambia.

Límites: 10 App IDs por semana (esta app gasta 3: `co.loatech.coco`,
`co.loatech.coco.widgets` y `co.loatech.coco.tests`; la extensión se llamó
`co.loatech.coco.accesos` hasta el paso 7.13d, y el cambio gasta uno más la
primera vez que se firma), 3 apps instaladas a la vez
por cuenta gratuita. Sin APNs ni App Groups: no se usan.

## Las dos automatizaciones de Atajos

También están en la pantalla de Bienvenida de la app.

- **Wallet:** Automatización → Transacción → elegir tarjetas → «Ejecutar de
  inmediato» (y desactivar «Notificar al ejecutar») → acción «Registrar gasto
  de Wallet» con Comercio ← Comercio, Monto ← Monto, Tarjeta ← Tarjeta o
  pase, Nombre ← Nombre.
- **SMS:** Automatización → Mensaje → remitente contiene (el banco) →
  «Ejecutar de inmediato» → «Registrar gasto de SMS» con Texto ← Contenido
  del mensaje, Remitente ← Remitente.

Si Wallet no manda el monto, el gasto se guarda en 0 y queda por revisar.

## Accesos rápidos

- Botón de acción en iOS 17: Atajo → «Registrar gasto en Coco». En iOS 18:
  Controles → «Registrar gasto».
- Control del Centro de control y de la pantalla bloqueada (iOS 18).
- Widget de inicio y de pantalla bloqueada (iOS 17).

## Orden de despliegue

**La API se despliega ANTES que la app.** `POST /transactions/capture`
acepta `category_id` y `nota` desde la fase 5; una app nueva contra una API
vieja recibe 400 en las capturas manuales y la cola las marca como fallidas
(se pueden reintentar después).

## Cómo funciona la sesión única

La app es la única dueña del refresh token (Keychain). La web embebida nunca
ve una cookie `coco_refresh` ni un token por URL: pide el access token por el
puente `cocoSesion` y lo guarda en memoria, como en el navegador. Para
verificarlo: Safari → Develop → Simulator → Coco, y en la consola
`document.cookie === ''`.

## Pruebas

```sh
cd ios && xcodegen generate
xcodebuild -scheme Coco -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Y antes de subir, el lint (lo mismo que el hook y el workflow):

```sh
bash ios/scripts/lint.sh
```

`CocoTests` cubre la cola, la sesión, el reintento, los montos
(`AmountParser`), las fechas (`BogotaDate`), los parámetros de las acciones,
la paridad del buscador con `buscar-en-arbol.test.ts` de la web (y falla si
esa prueba desaparece de las rutas que conoce), el puente, el perfil y su
vencimiento, el enrutador (URLs `coco://` y destinos), la composición
(`Dependencies` con dobles: registra intents y tareas de fondo, sigue la
insignia de la cola) y los textos de entrar y Ajustes.
`StoredFormatTests` fija las claves de la cola y del árbol, y `APIKeysTests`
las de los contratos de la API. `ContractsTests` lee `packages/types/src/index.ts`
y `api/openapi.v2.json`, y falla si `Brand.userAgentApp` se separa de
`USER_AGENT_APP` o la cabecera nativa o el campo de los soportes se separan
de la v2 (en el simulador se salta: no puede leer el archivo).

El workflow `ios` (GitHub Actions, macOS) corre el lint y las pruebas. Es
manual —Actions → ios → Run workflow— porque un minuto de macOS cuenta por
diez de la cuota: se lanza antes de cada versión de la app.

A mano en el simulador (humo): entrar, capturar a mano, capturar con una foto
de la fototeca, ver la cola sin red y verla vaciarse al volver la red, abrir la
web y comprobar que no hay cookies. Solo en el teléfono: Wallet, SMS, el
control del Centro de control y el botón de acción.

## Problemas conocidos

- Vision y los idiomas: se comprueban en tiempo de ejecución; si es-CO no está,
  se usa es-ES.
- El simulador no tiene cámara: se usa la fototeca.
- `BGTaskScheduler` no tiene horario garantizado. Para forzarlo en depuración,
  con la app parada en el depurador:
  `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"co.loatech.coco.queue"]`.
- Si el bundle id ya estuviera tomado por otra cuenta, cambiar `bundleIdPrefix`
  en `project.yml`.
