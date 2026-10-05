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
   `navegacion`, `sesion`). En zsh `log` es un builtin: usar la ruta entera.

   ```sh
   /usr/bin/log stream --info --predicate 'subsystem == "co.loatech.coco"' --style compact
   ```

4. Entrar con el usuario de `api/.env.supabase-dev`. Después: Inicio carga la
   web sin techo ni barra; Registrar guarda con la API apagada y Capturas
   enseña «1 pendiente»; Más → Centros de costos abre la ruta en el mismo
   webview; Más → Cerrar sesión vuelve a la ficha de entrar.
5. Deep links: `xcrun simctl openurl booted coco://capturar/manual` (o
   `coco://capturar/foto`, `coco://capturas`). iOS pregunta «¿Abrir en Coco?»
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
el puente, el perfil y su vencimiento, el enrutador (URLs `coco://` y
destinos), la composición (`Dependencias` con dobles: registra intents y
tareas de fondo, sigue la insignia de la cola) y los textos de entrar y
Ajustes. `ContratosTests` lee
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
