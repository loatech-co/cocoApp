---
paths:
  - 'frontend/src/**'
---

# Estructura del frontend

Lo vigila `npm run depcruise` (`.dependency-cruiser.cjs`, reglas `web-*`) y
falla el CI. No hay excepciones.

## Las tres capas

**Una importación solo baja: `app/` → `features/` → `shared/`.**

Así cada capa se lee, se prueba y se mueve conociendo solo las de debajo.
`app/` es el arranque, las rutas, los proveedores y el armazón (riel, barra de
abajo, hoja de la cuenta, paleta de atajos, navegación). Nadie importa `app/`.

**Una feature es un dominio, no una pantalla.**

El resumen era `features/dashboard`, pero lo que muestra son movimientos: su
tabla, sus filtros y su ficha. Por eso vive en `features/transactions/pages/`.
Cada feature tiene `pages/`, `components/`, `api/` (hooks de React Query),
`hooks/` y `model/` (lógica de negocio y tipos), y solo las carpetas que usa.

Hoy son `admin`, `auth`, `bank-accounts`, `cost-centers`, `profile` y
`transactions`.

**Las rutas van en inglés, y una dirección vieja redirige, nunca da 404.**

Son `/accounts`, `/cost-centers`, `/account`, `/admin` (con
`/admin/audit-log`) y `/sign-up`. Las de antes —`/centros-de-costos`,
`/mi-cuenta`…— siguen vivas en `app/legacy-routes.tsx` y llevan a la nueva:
hay marcadores y enlaces guardados apuntando ahí, y no romperlos es gratis.

**Las features no se importan entre sí: lo común sube a `shared/`.**

Un enlace escondido entre dos dominios es el que nadie recuerda al cambiar
uno. Ejemplos: el árbol de categorías lo usan centros y movimientos, y está en
`shared/api/categories.ts`; la política de contraseña la usan auth, admin y
perfil, y está en `shared/ui/atoms/password-policy.tsx`; la lista de
secciones la usan el armazón y Mi cuenta, y está en `shared/lib/sections.ts`.

**`shared/` nunca importa de `features/`.**

Si lo hiciera, dejaría de ser compartido: arrastraría un dominio a todos los
demás.

**`shared/lib` es el suelo: no dibuja ni pide datos.**

Fechas y dinero (`format.ts`), los textos (`i18n.ts`), foco, gestos, el
puente con la app. Si algo de
`lib/` necesita la sesión, es de `shared/api` (por eso `registerBridge` vive
en `shared/api/native-bridge.ts` y no en `shared/lib/bridge.ts`).

## El contrato con la API: `shared/api/generated`

**La web habla con `/api/v2` por un cliente que genera Orval, y no lo toca
nadie a mano.**

`frontend/src/shared/api/generated/` sale de `api/openapi.v2.json` con
`npm run generate:api --workspace frontend`: funciones `fetch` tipadas y los
tipos del esquema (D11). Va versionado porque hbuilds construye sin
devDependencies, y el CI lo regenera y falla si no coincide. Los hooks de
React Query NO se generan: cada feature escribe los suyos en su `api/`
llamando a esas funciones (`useAccounts` → `accountsList`).

- Toda petición pasa por `apiRequest` (`shared/api/api-client.ts`, el
  `mutator` de Orval). Solo se lo saltan las llamadas de sesión
  (`session.ts`: renovar es en lo que se apoya la puerta) y la subida de
  soportes (`apiUpload`: necesita el progreso).
- Toda lista de la v2 viene paginada: lo que necesita el conjunto entero usa
  `allPages` (`shared/api/pages.ts`).
- Lo que habla otro dialecto se traduce en el borde, una vez: el árbol pasa a
  la forma que busca `@coco/receipt-parser` (`shared/lib/searchable-tree.ts`);
  el nivel y la granularidad del resumen pasan a las palabras que ve la
  persona (`dashboard-charts.tsx`). La sesión del puente ya es la de la v2
  (`BridgeSession`): no se traduce.
- Lo que no está en el documento —el puente (`cocoSession` y `cocoEvents`), la
  marca del User-Agent de la app y los límites de los soportes— vive en
  `shared/lib/native-contract.ts`. `receipts.contract.spec.ts` de la API y
  `ContractsTests` de iOS lo leen por su ruta. Reemplazó a `packages/types`,
  que ya no existe.
- `shared/ui` no importa ni el cliente generado ni el contrato nativo, ni
  siquiera sus tipos (`web-ui-knows-no-contract`).

## Los textos: `locales/es.json`

**Ningún texto que lea una persona se escribe en un componente.** Vive en
`locales/es.json`, con clave en inglés y por dominio
(`transactions.fields.amount`), y se lee con `t` de `shared/lib/i18n.ts`. Las
claves están tipadas desde el propio JSON: una que no existe no compila.

- **Dónde va una clave.** Bajo su dominio (`transactions`, `centers`,
  `accounts`, `admin`, `auth`, `profile`), el armazón bajo `shell`, la
  interfaz compartida bajo `ui`, los errores del cliente bajo `errors`, y lo
  que se repite en varias pantallas («Cancelar», «Guardar») bajo `common`.
- **Lo que rellena el código va interpolado**, nunca pegado:
  `t('accounts.creditAvailable', { amount })` con `"Cupo disponible: {{amount}}"`.
  Partir una frase en dos claves alrededor de un valor la deja imposible de
  revisar. La excepción es un elemento DENTRO de la frase (un `<strong>`): ahí
  se parte, o se usa `Trans` de react-i18next.
- **Singular y plural son dos claves** (`movementsOne`, `movementsMany`), no el
  `count` de i18next: es explícito y no depende de reglas de plural.
- **Lo que manda la API se muestra tal cual.** El `detail` de un
  `problem+json` ya está escrito para la persona: no se busca en el catálogo.
- **Dinero y fechas salen de `shared/lib/format.ts`**, el único sitio que
  llama a `Intl` (siempre `es-CO`). Los nombres de meses y días también: no
  se escribe una lista a mano.

`i18next/no-literal-string` falla con un texto con letras escrito como hijo de
JSX; sus excepciones están en `TEXT_EXCEPTIONS` (`eslint.config.js`).
`locales/catalog.test.ts` compara el catálogo con el inventario de los textos
de antes (`es.inventory.json`) y falla si alguno cambió o se perdió, o si hay
una clave que ninguna pantalla usa. Cambiar un texto a propósito es cambiarlo
en los dos archivos en el mismo commit.

## La interfaz: `shared/ui`

**`shared/ui` dibuja lo que le dan: ni React Query, ni `api-client`, ni sesión.**

Un componente que pide sus datos solo sirve donde esos datos existen y solo se
prueba con un servidor. Lo que sabe qué es un movimiento, un concepto o un
soporte es un organismo de dominio y vive en `features/<dominio>/components/`,
con sus datos en el `api/` de su feature: `SearchPanel` usa
`useTransactions`, `TransactionsTable` usa `useUpdateTransaction`.

**El nivel de un componente es el más bajo que permiten sus importaciones.**

Un nivel decidido por opinión se discute en cada componente; uno decidido por
lo que importa lo comprueba una máquina.

| Nivel        | Puede usar                                | Ejemplos en Coco                                               |
| ------------ | ----------------------------------------- | -------------------------------------------------------------- |
| `atoms/`     | ningún otro componente de `shared/ui`     | `Button`, `Input`, `Field`, `Checkbox`, `BottomSheet`, `Donut` |
| `molecules/` | solo átomos                               | `Menu` (Button + BottomSheet), `ModalParts` (Button)           |
| `organisms/` | moléculas y átomos, nunca otro organismo  | `Select` (Menu + Field), `Confirmation` (ModalPartes + Button) |
| `templates/` | organismos, moléculas y átomos, sin datos | Ninguna todavía                                                |

Que `BottomSheet` o `Donut` sean átomos no dice que sean pequeños: dice que no
se apoyan en ninguna otra pieza, así que cambiar otra pieza no los cambia.

**`shared/ui/foundations/` es lo que todos los niveles pueden usar, y no es un
componente.**

Clases y contextos sin marcado: `FLOATING_SURFACE` (`surface.ts`) y el
contexto del campo con `FIELD_FOCUS` (`field.ts`). Sin esta carpeta, `Input`
sería una molécula solo por leer el contexto de `Field`.

**Los nombres de archivo y carpeta van en inglés kebab-case.** Lo vigilan
`check-file` (`eslint.config.js`) y `lint:spanish`.

## Rígido en las piezas, flexible en la composición

**Fuera de `shared/ui` una pantalla compone componentes: ni `<button>`,
`<input>`, `<textarea>`, `<select>`, `<dialog>` o `<table>` crudos, ni colores,
radios o medidas arbitrarios de Tailwind (`bg-[#…]`, `rounded-[…]`, `w-[…]`,
`text-[13px]`).**

Un control dibujado en una pantalla es una copia, y las copias se separan:
había dos interruptores (uno 4px más ancho y con otra perilla en oscuro), dos
migas de vuelta, dos cabeceras de búsqueda y tres avisos de error con su lista
de detalles, cada uno escrito a mano. Lo vigila el lint (`coco/no-raw-elements`
y `coco/no-arbitrary-values`, en `eslint.config.js`).

**La flexibilidad vive en el componente, nunca en la llamada.**

Una necesidad nueva es una variante del componente —como `size` en `Button` o
`width` en `Menu`—, no un `className` donde se usa. La llamada puede COLOCAR la
pieza (un margen, una celda de la rejilla); no la viste. Por eso las piezas
nuevas no aceptan `className`.

**Ante algo nuevo: combinar lo que existe → añadir una variante → crear un
componente en el nivel más bajo posible, con su historia en el catálogo.**

**Una excepción se registra con su motivo en un solo sitio, o no existe.**

Para estas dos reglas, `DESIGN_EXCEPTIONS` en `eslint.config.js`; el lint
falla también si una entrada ya no la usa nadie. El suelo táctil
(`mobile:min-h-[42px]`) tiene su propio registro en
`shared/ui/touch-floor.test.ts`, y el radio por encima de 10px en
`shared/ui/radius.test.ts`.

Un `var(--token)` no es arbitrario —lee el tema— y un escalón de la escala
tampoco: `min-h-55` son 220px y `size-4.5` son 18. Lo que el tema no tiene se
añade en `index.css` con su razón (`leading-hero`, `pb-safe`).
