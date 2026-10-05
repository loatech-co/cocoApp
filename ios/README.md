# Coco para iPhone

La app del teléfono de Coco. Es híbrida: lo que se hace con una mano en diez
segundos —anotar un gasto, fotografiar un recibo, recibir lo que Wallet o un
SMS traen— es SwiftUI nativo; todo lo demás es la misma web, dentro de un
`WKWebView`, con UNA sola sesión que la app administra.

**Primera línea, y la más importante:** `xcodegen generate` PISA el
`.xcodeproj`. Lo que no esté en `project.yml` —fuentes, Info.plist, targets,
settings— se pierde. Nunca se edita el proyecto a mano.

## Qué hay en cada carpeta

| Carpeta | Qué es |
|---|---|
| `Coco/Dominio` | Contratos (espejo de `@coco/types`, claves en snake_case) y los protocolos que cruzan módulos |
| `Coco/Red` | `ClienteAPI`, el constructor de peticiones, errores tipados y `Conectividad` |
| `Coco/Sesion` | La sesión nativa: el refresh en el Keychain, el access en memoria, single-flight |
| `Coco/Cola` | Capturas pendientes en disco, reintentos, envío en dos fases |
| `Coco/Arbol` | El árbol de categorías guardado en el teléfono y su buscador |
| `Coco/Intents` | Las acciones de Atajos (App Intents) y el `AppShortcutsProvider` |
| `Coco/Captura` | Formulario rápido, cámara, lectura del recibo, lista de capturas |
| `Coco/Web` | El `WKWebView` único y el puente `cocoSesion` |
| `Coco/App` | Composición, navegación híbrida, login, Más, Ajustes |
| `Coco/Avisos` | Notificaciones locales y el aviso de que la firma caduca |
| `Coco/SegundoPlano` | `BGTaskScheduler`: renovar el token y vaciar la cola |
| `Coco/Bienvenida` | La guía para crear las dos automatizaciones de Atajos |
| `CocoAccesos` | Extensión de WidgetKit: control (iOS 18) y widget (iOS 17) |
| `CocoTests` | Pruebas XCTest de todo lo anterior |

## Requisitos

- macOS con Xcode 16 o superior. Probado con Xcode 27.0 / iOS 27 / Swift 6.4
  en modo de lenguaje 5.10 (`SWIFT_VERSION` en `project.yml`).
- `brew install xcodegen`.
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

La app lee `CocoAPIBaseURL` de su Info.plist (lo declara `project.yml`; por
defecto `https://dev-cocoapp.viteri.me`). Para cambiarla sin recompilar:
Más → Ajustes → URL de la API → por ejemplo `http://localhost:3000`. El valor
se guarda en UserDefaults y manda sobre el plist; «Restablecer» vuelve al plist.

La API local arranca contra cocoApp-dev con `PERMITIR_AUTH_DESTRUCTIVA=si`
solo en local. ATS permite red local sin TLS únicamente por
`NSAllowsLocalNetworking`; cualquier otro host sigue exigiendo HTTPS. El
usuario de desarrollo y su contraseña están en `api/.env.supabase-dev` (nunca
en git).

## Instalar en el teléfono con una cuenta gratuita

1. Xcode → Settings → Accounts → añadir el Apple ID (aparece como «Personal
   Team»).
2. En Signing & Capabilities de los TRES targets (Coco, CocoAccesos,
   CocoTests) elegir ese equipo. `DEVELOPMENT_TEAM` está vacío en
   `project.yml` a propósito y no se versiona.
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

Límites: 10 App IDs por semana (esta app gasta 3), 3 apps instaladas a la vez
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

`CocoTests` cubre la cola, la sesión, el reintento, los montos
(`LectorDeMonto`), las fechas (`FechaDeBogota`), los parámetros de las
acciones, la paridad del buscador con `frontend/src/lib/buscar-en-arbol.test.ts`,
el puente, el perfil y su vencimiento, y el enrutador. `ContratosTests` lee
`packages/types/src/index.ts` y falla si `Marca.userAgentApp` se separa de
`USER_AGENT_APP`.

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
  `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"co.loatech.coco.cola"]`.
- Si el bundle id ya estuviera tomado por otra cuenta, cambiar `bundleIdPrefix`
  en `project.yml`.
