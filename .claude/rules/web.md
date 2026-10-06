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
- Lo que habla otro dialecto se traduce en el borde, una vez: la sesión que da
  el puente sigue en v1 (`desdeElPuente`, en `session.ts`); `@coco/lectura` lee
  `palabras_clave` (`shared/lib/searchable-tree.ts`); el nivel y la
  granularidad del resumen pasan a las palabras que ve la persona
  (`dashboard-charts.tsx`).
- Lo que no está en el documento —el puente, la marca del User-Agent de la
  app, el contrato v1 que aún habla el teléfono— vive en
  `shared/lib/native-contract.ts`. Dos pruebas de la API y `ContratosTests`
  de iOS lo leen por su ruta. Reemplazó a `packages/types`, que ya no existe.
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

**Los nombres nuevos de archivo y carpeta van en inglés kebab-case.**

Los que solo se movieron conservan su nombre en español hasta el paso 7.2, que
renombra identificadores y archivos a la vez.

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
(`movil:min-h-[42px]`) tiene su propio registro en
`shared/ui/touch-floor.test.ts`, y el radio por encima de 10px en
`shared/ui/radius.test.ts`.

Un `var(--token)` no es arbitrario —lee el tema— y un escalón de la escala
tampoco: `min-h-55` son 220px y `size-4.5` son 18. Lo que el tema no tiene se
añade en `index.css` con su razón (`leading-portada`, `pb-seguro`).

## Inventario de `shared/ui`

Se actualiza en el mismo PR que crea o cambia un componente.

| Componente                       | Nivel      | Para qué                                                                                          |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `foundations/field.ts`           | fundamento | Contexto «dentro de un campo», hueco de la etiqueta, `FIELD_FOCUS`, `fieldTrigger`                |
| `foundations/surface.ts`         | fundamento | Color, tinta, sombra y canto de lo que flota; `HIGHLIGHT` y `SURGE`                               |
| `atoms/add-surface.tsx`          | átomo      | El hueco punteado de «agregar» (`AddSurface`): `slot`, `bar` o `row`                              |
| `atoms/alert.tsx`                | átomo      | Aviso en línea: error o información; `ErrorAlert` con su lista de detalles                        |
| `atoms/badge.tsx`                | átomo      | `Tag`, `Chip` y `Badge`: rótulos cortos con el color de su papel                                  |
| `atoms/bar-slot.tsx`             | átomo      | Los huecos de la barra de abajo: `BarSlotLink`, `BarSlotButton`, `BarIcon` y `BarFab`             |
| `atoms/block.tsx`                | átomo      | El bloque dentro de una tarjeta (`BLOCK` para un `<label>` o `<button>`)                          |
| `atoms/button.tsx`               | átomo      | El botón; su tamaño lo decide `size`                                                              |
| `atoms/page-header.tsx`          | átomo      | Título, ayuda, raya y acciones de una pantalla; `PAGE_TITLE`                                      |
| `atoms/field.tsx`                | átomo      | Envoltorio con la etiqueta flotante de cualquier control                                          |
| `atoms/card-row.tsx`             | átomo      | Fila pulsable de una lista dentro de una tarjeta (`CardRow`): un pago pendiente                   |
| `atoms/card.tsx`                 | átomo      | La tarjeta: material apoyado en el pozo, sin borde                                                |
| `atoms/checkbox.tsx`             | átomo      | Casilla de verificación propia                                                                    |
| `atoms/icon-chip.tsx`            | átomo      | Icono en su pastilla de color                                                                     |
| `atoms/collapsible-header.tsx`   | átomo      | Cabecera de una tarjeta que se pliega, con su galón (`CollapsibleHeader`)                         |
| `atoms/donut.tsx`                | átomo      | Gráfica de dona con su pista flotante                                                             |
| `atoms/drop-surface.tsx`         | átomo      | El cuadro donde se sueltan o se eligen archivos (`DropSurface`)                                   |
| `atoms/empty-state.tsx`          | átomo      | Lo que se ve cuando una lista no tiene nada                                                       |
| `atoms/file-picker.tsx`          | átomo      | El campo de archivos del navegador, escondido (`FilePicker`)                                      |
| `atoms/icons.tsx`                | átomo      | Los iconos que se eligen para una categoría                                                       |
| `atoms/input.tsx`                | átomo      | Campo de texto con iconos informativos y acciones (`FieldAction`)                                 |
| `atoms/switch.tsx`               | átomo      | Interruptor de encendido y apagado; `isLoading` mientras guarda                                   |
| `atoms/level-nav.tsx`            | átomo      | Moverse por un árbol: volver (`BackCrumb`) y bajar (`DrillButton`)                                |
| `atoms/logo.tsx`                 | átomo      | El logotipo, entero y compacto                                                                    |
| `atoms/amount.tsx`               | átomo      | Una cifra de dinero con su `direction` —entra, sale, se mueve— (`Amount`) y un saldo (`Balance`)  |
| `atoms/pager.tsx`                | átomo      | Paginador de una tabla                                                                            |
| `atoms/bottom-sheet.tsx`         | átomo      | La hoja que sube desde abajo en el teléfono                                                       |
| `atoms/panel-row.tsx`            | átomo      | Fila de 48 de un panel (`PanelRow`, tono `danger`); `PANEL_ROW_CLASS` para un enlace              |
| `atoms/pdf-canvas.tsx`           | átomo      | La primera página de un PDF en un lienzo (`PdfCanvas`): miniatura o previsualización              |
| `atoms/pdf-page.tsx`             | átomo      | Una página de un PDF al tamaño del zoom, sobre el velo de un visor (`PdfPage`)                    |
| `atoms/password-policy.tsx`      | átomo      | Lo que una contraseña tiene que cumplir, y si lo cumple                                           |
| `atoms/progress.tsx`             | átomo      | Barra de progreso                                                                                 |
| `atoms/rail-toggle.tsx`          | átomo      | Plegar y desplegar el riel (`RailToggle`)                                                         |
| `atoms/search-box.tsx`           | átomo      | La caja de filtrar una lista a la vista (`SearchBox`): `header` o `box`                           |
| `atoms/skeleton.tsx`             | átomo      | Hueco de carga                                                                                    |
| `atoms/text-button.tsx`          | átomo      | Acción que se lee como texto (`TextButton`): `primary`, `subtle` o `highlight`                    |
| `atoms/text-link.tsx`            | átomo      | Enlace dentro de una frase, subrayado en reposo (`TextLink`)                                      |
| `atoms/textarea.tsx`             | átomo      | Campo de texto de varias líneas                                                                   |
| `atoms/tile.tsx`                 | átomo      | Baldosa de la rejilla de atajos: `tileClass`, `MovableTile` y `TileRemove`                        |
| `atoms/toggle-option.tsx`        | átomo      | Opción de una lista corta que se enciende (`ToggleOption`): los atajos de rango                   |
| `atoms/tooltip.tsx`              | átomo      | Pista al pasar por encima (`WithTooltip`), anunciada con `aria-describedby`                       |
| `molecules/toast.tsx`            | molécula   | Avisos flotantes de la esquina: `showToast` y su pila                                             |
| `molecules/calendar.tsx`         | molécula   | El calendario de los selectores de fecha: un día o un rango                                       |
| `molecules/money-field.tsx`      | molécula   | Campo de importe con separador de miles                                                           |
| `molecules/icon-grid.tsx`        | molécula   | La rejilla de iconos de una categoría (`IconGrid`)                                                |
| `molecules/link-row.tsx`         | molécula   | Fila de una hoja que lleva a una página (`LinkRow`)                                               |
| `molecules/menu-rich-option.tsx` | molécula   | Opción de menú con pastel y línea de ayuda (`MenuRichOption`)                                     |
| `molecules/menu.tsx`             | molécula   | Base de todo desplegable: abrir, cerrar, Escape y colocarse; `width` con nombre                   |
| `molecules/modal-parts.tsx`      | molécula   | Cabecera, cuerpo, pie y ancho de una ficha (`MODAL_PANEL`, `ModalBody`)                           |
| `molecules/overlay-control.tsx`  | molécula   | Mandos sobre un documento o un velo (`OverlayButton`, `ControlSeparator`, `ControlReadout`)       |
| `molecules/section.tsx`          | molécula   | Una parte de una ficha con su nombre encima (`Section`)                                           |
| `molecules/table.tsx`            | molécula   | Tabla, filas, celdas, pie y esqueleto                                                             |
| `organisms/combo.tsx`            | organismo  | Desplegable con filtro y, si se pide, «crear» (`CreateOption`, también del buscador de conceptos) |
| `organisms/confirmation.tsx`     | organismo  | La ficha que pregunta antes de algo irreversible                                                  |
| `organisms/modal.tsx`            | organismo  | El armazón de una ficha                                                                           |
| `organisms/select.tsx`           | organismo  | El desplegable que reemplaza a `<select>`                                                         |

# Reglas de la interfaz

Las rutas son relativas a `frontend/src/`. Cada regla va arriba, en una línea;
el porqué, debajo. Si una prueba la protege, no se desactiva.

|     | Regla                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | [Ningún control del sistema operativo](#1-ningún-control-del-sistema-operativo)                                        |
| 2   | [El tamaño de un botón lo decide el botón](#2-el-tamaño-de-un-botón-lo-decide-el-botón)                                |
| 3   | [El radio estándar es 10px](#3-el-radio-estándar-es-10px)                                                              |
| 4   | [Dos tamaños, y los mismos para todo](#4-dos-tamaños-y-los-mismos-para-todo)                                           |
| 5   | [El color vive en `index.css`, y se nombra por su papel](#5-el-color-vive-en-indexcss-y-se-nombra-por-su-papel)        |
| 6   | [Tres superficies: el material, el pozo y lo elegido](#6-tres-superficies-el-material-el-pozo-y-lo-elegido)            |
| 7   | [Nada de mayúsculas sostenidas](#7-nada-de-mayúsculas-sostenidas)                                                      |
| 8   | [`accent` es lo que responde; `muted` es lo que está quieto](#8-accent-es-lo-que-responde-muted-es-lo-que-está-quieto) |
| 9   | [Lo que flota se dibuja en un solo sitio](#9-lo-que-flota-se-dibuja-en-un-solo-sitio)                                  |
| 10  | [La cabecera de una pantalla](#10-la-cabecera-de-una-pantalla)                                                         |
| 11  | [La cabecera y el pie de una ficha](#11-la-cabecera-y-el-pie-de-una-ficha)                                             |
| 12  | [Una ficha mide 720px, y dentro reparte a la mitad](#12-una-ficha-mide-720px-y-dentro-reparte-a-la-mitad)              |
| 13  | [El nombre de un campo va DENTRO, y flota](#13-el-nombre-de-un-campo-va-dentro-y-flota)                                |
| 14  | [Un aviso flotante dice su severidad de tres maneras](#14-un-aviso-flotante-dice-su-severidad-de-tres-maneras)         |
| 15  | [Un movimiento es un REGISTRO; el concepto es estructura](#15-un-movimiento-es-un-registro-el-concepto-es-estructura)  |
| 16  | [El rojo es solo para errores](#16-el-rojo-es-solo-para-errores)                                                       |
| 17  | [Componentes, no copias](#17-componentes-no-copias)                                                                    |
| 18  | [El foco se pinta cuando se pide](#18-el-foco-se-pinta-cuando-se-pide)                                                 |

## 1. Ningún control del sistema operativo

**Regla:** Nunca `<select>` ni `<input type="date|time|color">`: todo desplegable se construye sobre `menu.tsx`.

**Nunca** se usa el desplegable ni el selector de fecha nativos. Ni
`<select>` con su lista, ni `<input type="date">`, ni `type="time"`,
ni `type="color"`.

**Por qué.** Esos controles los dibuja el sistema operativo: su tipografía,
sus colores, su idioma y sus convenciones —la semana empezando en domingo,
el triángulo negro pegado al borde—. La misma pantalla se ve distinta en
cada máquina, y en medio de un formulario verde aparece un cuadro gris de
Windows.

**Qué se usa en su lugar.** Todo desplegable se construye sobre
`shared/ui/molecules/menu.tsx`, que es el que sabe abrir, cerrar al tocar fuera,
cerrar con Escape y colocarse. Encima de él:

| En vez de             | Va                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `<select>`            | `shared/ui/organisms/select.tsx`                                                         |
| `<input type="date">` | `features/transactions/components/date-selector.tsx` (`DateSelector`: un día o un rango) |
| cualquier menú        | `shared/ui/molecules/menu.tsx`                                                           |

El calendario de los dos selectores de fecha es el mismo:
`shared/ui/molecules/calendar.tsx`. Un extremo pinta un día, dos pintan un rango.

## 2. El tamaño de un botón lo decide el botón

**Regla:** El alto, el radio y el peso de un botón viven en su `size`; una llamada nunca los escribe en `className`.

El alto, el radio y el peso de la letra viven en `size` dentro de
`shared/ui/atoms/button.tsx`. Una llamada **nunca** los escribe en su
`className`; si hace falta una medida nueva, se añade un `size`.

Hay una prueba que lee el código fuente y falla si alguien lo hace:
`shared/ui/atoms/button.calls.test.ts`.

## 3. El radio estándar es 10px

**Regla:** El radio es `rounded-lg` (10px): menor donde haga falta, nunca mayor salvo lo registrado en `ALLOWED`.

`rounded-lg`, que es el `--radius` del tema. Lo usan las tarjetas, los
desplegables, los modales, las tablas y los campos. Puede ser **menor**
donde haga falta —una casilla, un chip— pero **nunca mayor**: dos
contenedores vecinos con esquinas distintas se leen como dos sistemas
distintos.

Hay una prueba que lee el código fuente y falla si aparece un
`rounded-xl`, `rounded-2xl`, `rounded-3xl` o un radio arbitrario por
encima de 10px: `shared/ui/radius.test.ts`.

La escala crece en orden: `sm` 6, `md` 8, `lg` 10, `xl` 14. El `2xl` y el
`3xl` de Tailwind no leen el tema —valen 16 y 24 fijos— y por eso están
prohibidos.

**Las dos excepciones son los cantos que miden una pantalla entera.** El
pozo —la esquina donde se abre el contenido dentro de la página, en
`app/app-shell.tsx`— lleva 14px, y las dos esquinas de arriba de una hoja
que sube desde el borde de abajo —`shared/ui/atoms/bottom-sheet.tsx`— llevan
16px.

Se pasan por lo mismo: son los cantos más largos que hay, y 10px en un
borde que mide toda la altura o todo el ancho de la ventana casi no se ven.
Lo que esas esquinas cuentan —que el riel envuelve al contenido, que la
hoja está ENCIMA y la página sigue debajo— depende de que se vean. Y
ninguna rompe la regla, que habla de contenedores VECINOS: el pozo no es
vecino de ninguna tarjeta, es el fondo de todas, y la hoja no tiene vecinos
porque está sobre todo lo demás. Están registradas con su motivo en
`ALLOWED`, dentro de la misma prueba; toda excepción nueva se escribe
ahí o no existe.

## 4. Dos tamaños, y los mismos para todo

**Regla:** Botón, campo, desplegable y selector de fecha miden `sm` 36px o `md` 44px; los `-icon` son esas alturas en cuadrado.

Un botón, un campo de texto, un desplegable y un selector de fecha miden
lo mismo: `sm` 36px y `md` 44px. Una fila donde el botón mide 40, el campo
42 y el selector 36 se ve temblorosa aunque nadie sepa decir por qué.

Las variantes de icono —`sm-icon`, `md-icon`— son esas mismas alturas en
cuadrado. No son un tamaño más.

## 5. El color vive en `index.css`, y se nombra por su papel

**Regla:** Ningún color a mano: los tokens viven en `index.css` y se nombran por su papel, no por su tono.

Los tokens del tema —Solstice— están en una sola capa de `index.css`. Nada
de colores escritos a mano en un componente: si hace falta uno que el tema
no da, se añade ahí con su razón.

Y se nombran por lo que SIGNIFICAN, no por el color que tienen hoy. Los
chips eran `violeta`, `turquesa`, `verde` y `lima`; al cambiar de tema el
del gasto pasó a pino y el nombre se volvió mentira. Ahora son `gasto`,
`ingreso`, `presupuesto` y `movimientos`, y un tema nuevo no obliga a
tocar ni una llamada.

Sobre cualquier superficie de acento, la tinta es la que el tema declara
para ella (`accent-foreground`, `secondary-foreground`): nunca blanco por
costumbre. Blanco sobre un acento claro da 1.23:1, muy por debajo del
4.5:1 que exige el texto.

## 6. Tres superficies: el material, el pozo y lo elegido

**Regla:** Tres superficies —material (`card`, `popover`, `sidebar`), pozo (`background`) y lo elegido (`muted`)— y la tarjeta sin borde.

Había cinco escalones —riel, lienzo, tarjeta, bloque, chip— separados por
unos pocos puntos de luz. El ojo no distingue cinco grises casi iguales: lo
que veía era una pantalla lavada donde cada contenedor necesitaba un borde
para existir, y esa retícula de líneas de 1px es la firma visual de un
panel de administración de hace diez años.

Ahora son tres, y cada uno tiene un trabajo:

| Superficie  | Tokens                                            | Qué es                                                          |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------- |
| El material | `card`, `popover`, `sidebar` —el **mismo** valor— | De lo que están hechos el riel, las tarjetas y los desplegables |
| El pozo     | `background`                                      | El hueco donde se apoyan. Va por DEBAJO del material            |
| Lo elegido  | `muted`                                           | Un bloque dentro de una tarjeta, la opción ya seleccionada      |

**La tarjeta no lleva borde.** Lo que la separa del fondo es el escalón: es
material apoyado en el pozo. Vale igual para la tabla y para cualquier
contenedor de contenido. Lo que sí conserva el canto es lo que flota, y por
un motivo que el escalón no resuelve: un desplegable del color del material,
abierto sobre una tarjeta del mismo color, no tiene otra forma de decir
dónde empieza.

**El escalón va en el sentido que toca en cada tema.** En claro, lo de
dentro BAJA —un bloque es un hueco en la tarjeta, igual que el pozo lo es en
la página—. En oscuro SUBE, porque una sombra negra sobre un fondo casi
negro no proyecta nada y lo único que dice «esto está encima» es ser más
claro. Por eso `muted` se declara dos veces con valores que no se
corresponden.

**Y de ahí sale el armazón.** La página entera es el material y el contenido
se abre dentro, en el pozo, con la esquina de arriba a la izquierda
redondeada. Eso es lo que hace que el riel se lea como el marco que envuelve
al contenido y no como una columna pegada a su lado: es el mismo material
que lo rodea por arriba y por la izquierda. Sin la esquina, el cambio de
color es una raya vertical y vuelven a ser dos columnas.

## 7. Nada de mayúsculas sostenidas

**Regla:** Ningún texto en mayúsculas sostenidas ni con interletraje abierto.

Una palabra en versalitas pierde la silueta que la hace reconocible
—"Soporte" y "SOPORTE" no se leen igual de rápido— y donde todo el texto
es corto, un rótulo gritando compite con lo que titula. El tamaño y el
gris ya dicen que es un rótulo.

Vale para los modales, para los rótulos de los indicadores del resumen y
para los grupos de secciones del riel. El interletraje abierto que suele
acompañarlas también se va: el tema lo declara en cero y Geist ya viene
cerrada de por sí.

## 8. `accent` es lo que responde; `muted` es lo que está quieto

**Regla:** `accent` para lo que está bajo el cursor o el foco, `muted` para lo elegido; se invierten solo donde lo elegido no tiene otra señal.

El acento marca lo que está **bajo el cursor o el foco**: la opción de un
desplegable, la fila de una lista, un día del calendario, la zona donde se
va a soltar un archivo. `muted` marca lo que está **elegido**: la opción ya
seleccionada, la superficie de un bloque dentro de otro.

Con el mismo color para las dos, pasar por encima de lo que ya está
elegido no cambia nada y el control parece trabado.

**La excepción, y su regla.** Donde lo elegido no tiene otra señal —un
botón de la barra de herramientas encendido, que no lleva ni marca ni
texto que lo diga— los papeles se invierten: el acento va a lo encendido y
`muted` al paso del cursor. El color más fuerte va siempre a lo que no
tiene otra forma de decirse. Una opción de menú con su palomita no lo
necesita; un icono encendido, sí.

## 9. Lo que flota se dibuja en un solo sitio

**Regla:** Todo lo que flota usa `FLOATING_SURFACE`, con canto obligatorio; la sombra nunca se escribe a mano.

Un desplegable, un calendario, un modal, una confirmación, la pista de una
gráfica y el aviso de una esquina comparten `FLOATING_SURFACE`
(`shared/ui/foundations/surface.ts`): color, tinta, sombra y canto.

El canto es **obligatorio** y sale del borde del tema. La sombra sola no
delimita en ningún modo: en claro el popover es blanco sobre un lienzo
casi blanco, y en oscuro la sombra es negra sobre un fondo casi negro.

Una sombra sobre algo que ya tiene color no es una superficie flotante: es
un objeto que se levanta —una ficha mientras se arrastra— y esa sí puede
escribirse suelta.

`shared/ui/foundations/surface.test.ts` lee el código fuente y falla si alguien
vuelve a escribir la sombra a mano o a separar un panel con un negro o un
blanco inventados.

## 10. La cabecera de una pantalla

**Regla:** Toda pantalla con contenido abre con `PageHeader`, su acción va en `size="sm"` y tiene un solo `<h1>`.

Toda pantalla con contenido abre con `shared/ui/atoms/page-header.tsx`.
Nunca con un `<h1>` y un `<p>` escritos a mano.

**Por qué.** Esas tres líneas se escribieron ocho veces y salieron TRES
tipografías distintas: el resumen y los movimientos en 24/30px con la
familia de titulares, cinco pantallas en 30px plano con la del cuerpo, y
los centros de costos en 30/36. Nadie lo decidió. Y se nota al navegar,
que es lo peor: el título cambia de tamaño al pasar de una pantalla a
otra, así que la aplicación parece tres aplicaciones.

**Qué fija el componente, y no se pisa desde la llamada:**

| Pieza  | Valor                                                          | Por qué                                                                                     |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Título | `text-2xl sm:text-3xl`, familia de titulares, sin interletraje | Con 30px fijos, "Importar movimientos" ocupa dos renglones en un teléfono                   |
| Ayuda  | `text-sm text-muted-foreground`, una línea                     | Es qué es esta pantalla, no un párrafo                                                      |
| Raya   | `border-b border-border pb-4`, siempre                         | La llevaban dos de las ocho; el título ganaba y perdía una línea según por dónde se entrara |
| Acción | **`size="sm"`**                                                | Ver abajo                                                                                   |

**La acción va en `sm`, los 36px.** No es una preferencia. En la barra de
filtros la acción principal convive con la búsqueda, el orden, el filtro y
el rango, y ahí ya está decidido que todos los controles de la fila midan
lo mismo —romperlo dejaba la fila descuadrada—. Si el botón de Centros de
costos mide 44 y el del resumen 36, la misma acción cambia de tamaño al
cambiar de pantalla.

Y su icono va **sin medida propia** (`<Plus />`, no
`<Plus className="size-4" />`): el tamaño de los iconos lo pone el botón, y
escribirlo en la llamada duplica una decisión que ya está tomada.

**Los dos huecos.** `beside` va pegado al título —un botón de ayuda, una
etiqueta de estado—; `actions` va al extremo opuesto. Nada más entra en la
cabecera.

**Lo que NO es una pantalla con contenido.** El 404 y las dos de acceso no
tienen ayuda, ni acciones, ni contenido que separar con una raya. Usan la
clase `PAGE_TITLE` del mismo archivo, que es la tipografía sola.

**Y toda pantalla tiene exactamente un `<h1>`.** Las de acceso lo llevan en
`sr-only`, porque lo que se ve ahí es el logotipo y un SVG no puede hacer
ese papel: sin él, la única jerarquía de la página era el `<h2>` de la
tarjeta y quien navega con lector de pantalla no encontraba ninguno del que
colgaran los demás.

`shared/ui/atoms/page-header.test.ts` lee el código fuente y falla si una
pantalla vuelve a escribir su propio `<h1>` o si una acción de cabecera pide
un tamaño que no sea `sm`.

## 11. La cabecera y el pie de una ficha

**Regla:** Toda ficha abre con `ModalHeader` y cierra con `ModalFooter`; los botones del pie no se estiran y Cancelar va en `outline`.

Toda ficha abre con `ModalHeader` y cierra con `ModalFooter`
(`shared/ui/molecules/modal-parts.tsx`). Nunca con un `<div>` escrito a mano.

**Por qué están fuera de `Modal`.** Porque hay DOS armazones y siempre los
va a haber: `shared/ui/organisms/modal.tsx` sirve para las fichas que caben en su forma
—título, una línea de ayuda, una equis— y la del movimiento tiene el suyo,
porque lleva un pastel de color delante del título y un ancho distinto.
Encerradas dentro de `Modal`, la del movimiento no podía usarlas y las
copiaba.

### La cabecera

| Pieza         | Dónde va                                                            |
| ------------- | ------------------------------------------------------------------- |
| `leading`     | Delante del título: el pastel de color de un movimiento             |
| `title`       | `text-lg`, familia de titulares. **Nunca en mayúsculas sostenidas** |
| `description` | Debajo, `text-sm text-muted-foreground`. Una frase                  |
| `actions`     | Botones de icono `sm-icon` a la izquierda de la equis               |

La equis la pone el componente y va **junto a las demás acciones**, no en
la esquina opuesta: eliminar, editar y cerrar son las tres cosas que se
hacen con la ficha ENTERA, frente a las que se hacen con lo que tiene
dentro. Repartidas en dos esquinas hay que buscarlas por separado.

La cabecera **no se desplaza** (`shrink-0` dentro de la columna del panel).
En una ficha larga el título y la equis se iban por arriba, y a mitad de un
formulario no quedaba en pantalla ni qué se estaba editando ni por dónde
salir.

La fila interior va centrada y la exterior arranca arriba, y no es lo
mismo: el pastel tiene que quedar a la altura del título —no de su línea de
ayuda— y la equis tiene que quedarse arriba aunque debajo haya dos
renglones de explicación.

### El pie

**Los botones NO se estiran.** Van al tamaño de su texto, alineados a la
derecha. Los cuatro pies que había —centro de costos, concepto, movimiento
y cámara— llevaban `flex-1` en los dos botones, así que se repartían el
ancho a medias: en la ficha del movimiento, que llega a 1024px, cada uno
medía 480 y «Cancelar» pesaba exactamente lo mismo que «Registrar». Un
botón del tamaño de su texto dice cuál es la acción principal sin gritarlo.

A la derecha porque es donde termina de leerse un formulario: se recorre de
arriba abajo y de izquierda a derecha, y la acción que lo cierra va donde
acaba el recorrido.

**En el teléfono se apilan a ancho completo.** Dos botones del tamaño de su
texto, en una esquina, son dos blancos pequeños y juntos: es donde se pulsa
«Cancelar» queriendo pulsar «Guardar».

Y se apilan en el ORDEN en que están escritos, sin invertirlo. La
convención de escritorio sube el botón primario, pero en el teléfono esta
ficha está pegada al pie de la pantalla: lo de más abajo es lo que queda
más cerca del pulgar, y ahí tiene que estar la acción principal.

**Cancelar va en `outline`, no en `ghost`.** Un botón sin contorno al lado
de uno relleno no se lee como un botón: se lee como el texto de al lado del
botón.

`shared/ui/atoms/button.calls.test.ts` falla si un `<Button>` vuelve a
traer `flex-1`. (`w-full` sí se permite: estirar un botón a todo el ancho de
una columna angosta —el «Iniciar sesión» de una tarjeta de 384px— es otra
decisión, porque ahí no hay con quién competir.)

## 12. Una ficha mide 720px, y dentro reparte a la mitad

**Regla:** Una ficha mide como mucho 720px (`MODAL_PANEL`), 16px de relleno, 400px de alto mínimo y una sola rejilla mitad y mitad.

`MODAL_PANEL`, en `shared/ui/molecules/modal-parts.tsx`, topa el ancho de
**todas** las fichas en 720px. Una llamada puede pedir menos —la
confirmación mide `max-w-md`— pero **nunca más**.

**Por qué.** La ficha del movimiento llegaba a 1024 porque su columna del
soporte pedía sitio. Una ventana de 1024 dentro de una pantalla de 1440
deja de leerse como algo que está ENCIMA de la aplicación y empieza a
leerse como otra pantalla.

**Relleno: 16px por los cuatro lados**, y lo mismo en la cabecera y en el
pie. Eran 24 y sobraban: en una ficha topada a 720, ese marco se comía el
ancho que necesitan dos columnas. Vive en `Modal`, en `ModalHeader` y
en `Confirmation` —una llamada no lo escribe—, porque dos sangrados
distintos se ven como un escalón en el canto izquierdo de la ficha.

**Alto mínimo: 400px.** Para que abrir dos fichas seguidas no sea ver el
panel crecer y encogerse. No es para estirar las cortas: con 600 —que fue
el primer valor— una ficha de dos campos se abría con un palmo de vacío
debajo de sus botones.

**Y dentro, una sola rejilla.** La ficha del movimiento tiene cinco caras
—leer, editar, registrar a mano, registrar con un archivo y, pronto, con
una foto— y las cinco son lo mismo: un documento a la izquierda y sus datos
a la derecha. Esa rejilla se escribe **una vez**
(`REJILLA_DE_LA_FICHA`) y reparte mitad y mitad.

La previsualización no pasa de **350px de alto**, y va sola: sin fila de
miniaturas debajo. Lo que hacía esa fila —contar, elegir, añadir, quitar—
vive ahora sobre el propio documento, donde no gasta alto. Para mirarlo de
cerca está el pase a pantalla completa.

Por debajo de `lg` no hay reparto: son dos filas apiladas, porque en un
teléfono dos columnas de 170px no son dos columnas.

## 13. El nombre de un campo va DENTRO, y flota

**Regla:** Todo campo va dentro de `Field`, con su etiqueta flotante dentro; nunca un `<Label>` encima de un `<Input>`.

Todo campo de formulario se envuelve en `shared/ui/atoms/field.tsx`. Nunca un
`<Label>` encima de un `<Input>`.

**Cómo se comporta.** La etiqueta empieza donde estaría el marcador, del
tamaño del texto y en gris. Al enfocar el campo se encoge, se sube a la
parte de arriba del propio campo y se tiñe del color del anillo, dejando su
sitio al marcador. Al escribir, el marcador desaparece y queda lo escrito.
Al soltar el campo, la etiqueta se queda arriba si hay algo y baja si no.

**Por qué dentro.** Antes iba encima, con este argumento: un marcador
desaparece al escribir, así que al revisar un formulario ya lleno nadie sabe
qué era cada caja. El argumento sigue en pie, y por eso esta etiqueta NO es
un marcador: cuando hay algo escrito no se va. Lo que se gana es el renglón
que ocupaba encima de cada campo —seis campos son seis renglones— y que el
nombre y el valor se lean como una cosa y no como dos.

**Dónde vive la lógica.** En `index.css`, bajo `.campo`. Son cuatro
disparadores distintos que significan lo mismo —hay foco, el desplegable
está abierto, hay algo escrito, hay algo elegido— y escritos con utilidades
habría que repetir las cuatro propiedades de la posición subida una vez por
disparador.

**El hueco de arriba lo reserva cada control**, leyendo el contexto
`useInsideField()`. Hay cinco estructuras distintas —un `<input>`
suelto, uno con iconos en absoluto, un `<textarea>`, el disparador de un
desplegable dentro de la caja de `Menu`, y el del selector de fecha— y un
selector estructural que acertara con las cinco sería más frágil que un
contexto.

**El marcador es un EJEMPLO, no una regla.** «dd/mm/aaaa» sí; «Opcional»
no: que un campo no sea obligatorio ya se sabe porque el formulario se
envía sin él.

### Los iconos de un campo

| Sitio               | Qué es                                            | Cuántos   |
| ------------------- | ------------------------------------------------- | --------- |
| Izquierda (`icon`)  | **Informativo.** De qué es el campo. No se pulsa  | Uno       |
| Derecha (`actions`) | **Activas.** Borrar lo escrito, ver la contraseña | Hasta dos |

`actions` es una lista y no un `ReactNode` suelto porque el campo necesita
saber cuántas son para reservarles sitio con su relleno derecho, y contar
los hijos de un fragmento no se puede hacer de forma fiable.

Un icono a la izquierda corre la etiqueta flotante para que no le caiga
encima; lo dice con `data-icono`, que lee `.campo`.

**El selector de fecha es la excepción:** su calendario va a la DERECHA y no
lleva flecha. El calendario no es informativo —no hace falta un dibujo para
saber que «4 de abril de 2022» es una fecha—: es la señal de que esto abre
un calendario, que es exactamente el papel de la flecha de un desplegable.
Con las dos había dos iconos diciendo lo mismo, uno a cada lado del valor.

`shared/ui/atoms/field.test.tsx` comprueba los ganchos que el CSS necesita
—el orden de los hermanos, el marcador que siempre está, los `data-` de un
desplegable— y falla si una pantalla vuelve a escribir un `<Label>` suelto.

## 14. Un aviso flotante dice su severidad de tres maneras

**Regla:** `showToast` dice la severidad tres veces —pastilla con glifo, resplandor y halo— y nunca tiñe la superficie entera.

`showToast(title, { detail, tone })`. Dos líneas: el titular dice QUÉ
pasó en tres palabras —se lee de reojo, que es como se leen los avisos— y el
detalle explica. El detalle es opcional; un aviso que no necesita
explicación no se inventa una.

Cada tono se señala **tres veces**: una pastilla redonda del color de la
severidad con su glifo encima, un resplandor del mismo color entrando por el
borde izquierdo, y el halo de la pastilla al 15 %. El color solo no basta:
uno de cada doce hombres no distingue el rojo del verde, así que la forma
—palomita, triángulo, aspa— lo dice por otra vía.

**La superficie NO se tiñe entera.** Un aviso flotante está encima de todo
lo demás, y lo que dice que está encima es la sombra sobre el color del
popover. Teñir el rectángulo de rojo rompe esa lectura: deja de parecer una
capa y pasa a parecer un cartel.

**Los colores son los nuestros, la severidad es la de siempre.** Verde para
lo que salió bien, el oro del tema para lo que está pendiente, rojo para lo
que falló. Y la tinta que va ENCIMA de cada uno está declarada
—`--success-foreground` y compañía— porque el sentido se invierte con el
tema: en claro esos colores son oscuros y la tinta es blanca; en oscuro son
claros y la tinta es casi negra.

El glifo de un aviso flotante NO es el del aviso en línea. Allí el icono va
suelto y lleva su propio contorno (`CircleCheck`); aquí va dentro de una
pastilla que ya es un círculo, y con un icono circular quedan dos círculos
concéntricos.

## 15. Un movimiento es un REGISTRO; el concepto es estructura

**Regla:** El nombre de un movimiento se deriva de su concepto (`transactionName()`); conceptos, categorías y centros solo se editan en Centros de costos.

Un movimiento no es una cosa con nombre propio: es la anotación de que tal
día salió tal plata de tal concepto.

**Su nombre lo TOMA del concepto** al que pertenece, y se deriva —nunca se
guarda una copia—. Si se guardara, renombrar un concepto dejaría atrás a sus
movimientos: «Aseo» pasaría a llamarse «Aseo y limpieza» en Centros de
costos y en la tabla seguirían los cuarenta viejos diciendo «Aseo». Dos
nombres para lo mismo y ninguna forma de saber cuál es el bueno.

Está en `transactionName()` (`features/transactions/model/transactions.ts`), con sus dos
respaldos: si solo está clasificado hasta la categoría, su nombre; y
si no tiene clasificación —un movimiento importado y aún sin clasificar—, lo
que decía el papel (`description`, `merchant`). Ahí «PAGO PSE COMCEL» es
mejor que «Sin concepto», porque es justo el dato con el que alguien va a
decidir dónde clasificarlo.

**Borrar un movimiento NO borra su concepto.** Borra el registro de ese mes
y nada más; el concepto sigue vivo, listo para el mes siguiente. Hay que
decirlo en la confirmación, y no es un detalle: como el movimiento se llama
igual que su concepto, la papelera parece estar apuntando al concepto. Sin
esa frase, nadie borra un gasto mal anotado por miedo a llevarse «Aseo» por
delante.

**Conceptos, categorías y centros solo se editan y se eliminan desde Centros de
costos.** Desde la tabla de movimientos y desde la ficha de un movimiento se
anota y se corrige lo que PASÓ; no se rehace el mapa con el que se ordena.
Por eso el `Combo` de un concepto ofrece crear lo que falta pero nunca
renombrar ni borrar, y por eso el de centro de costos no ofrece ni crear.

Y allí los tres niveles se editan y se borran igual: `CategoryModal` para
renombrar —y para lo estático, que solo existe en un centro— y
`ConfirmDeletion` para quitar.

**Borrar una categoría PREGUNTA a dónde pasan sus movimientos.** No se
niega. Negarse era lo que había antes —«Si tiene movimientos, el sistema se
niega»— y dejaba la estructura sin forma de corregirse: un concepto mal
creado con un movimiento dentro no se podía quitar nunca. Lo que faltaba no
era una prohibición, era un dato.

Tres cosas que no pueden fallar en silencio, y que tienen prueba e2e:

- Los movimientos acaban donde se dijo. `category_id` es `ON DELETE SET
NULL`, así que un borrado sin reasignar los deja sin clasificar sin avisar.
- Se cuenta el SUBÁRBOL, no la fila. Los movimientos de un centro de costos
  no están en el centro: están en los conceptos, tres niveles más abajo.
- Se borra el subárbol entero. `parent_id` también es `ON DELETE SET NULL`,
  así que borrar una categoría dejaba a sus conceptos con el padre en nulo y los
  ascendía a centros de costos.

El destino no se elige solo. El sistema no sabe si el alquiler mal
clasificado pertenece a «Vivienda» o a «Oficina», y adivinar significa mover
plata a un sitio que nadie pidió.

**Y lo que protege un centro estático es su ESTRUCTURA.** En un centro
estático, un movimiento no se reclasifica —ni desde la tabla ni desde la
ficha—: eso se decide en Centros de costos. Pero sí se puede BORRAR, porque
borrarlo es quitar un registro y no tocar la estructura. Las dos mitades de
esa regla se han perdido una vez cada una:

- El bloqueo se cayó al rediseñar la ficha —los desplegables pasaron a
  bloquearse solo por dependencia—, así que la misma plata se podía mover o
  no según por dónde se entrara.
- La papelera estaba condicionada a que el centro NO fuera estático, así que
  en Costos fijos desaparecía y no había forma de borrar un gasto mal
  anotado sin ir a hacer dinámico su centro, que es lo contrario de lo que
  hay que hacer.

## 16. El rojo es solo para errores

**Regla:** El rojo es solo para errores y para lo irreversible; lo pendiente va en `warning`.

Lo pendiente —un movimiento sin clasificar— va en el verde medio del tema
(`warning`). El rojo se reserva a lo que de verdad salió mal y a lo que no
se puede deshacer.

La paleta es de cuatro verdes y no tiene un cálido: verde británico, lima,
turquesa y verde medio. Eso deja lo pendiente a 16° de matiz de lo que
entra, así que donde los dos puedan convivir —una fila vencida en una tabla
con ingresos— la señal no puede ser solo el color: la palabra, el signo o
el peso de la letra tienen que decirlo también.

## 17. Componentes, no copias

**Regla:** Lo que aparece en dos pantallas es un componente, o exporta su clase si no puede serlo.

Si algo aparece en dos pantallas, es un componente. Lo son la tabla de
movimientos, el paginador, la barra de filtros, el calendario, la dona, la
cabecera de una pantalla (`shared/ui/atoms/page-header.tsx`), la cabecera
y el pie de una ficha (`shared/ui/molecules/modal-parts.tsx`), el campo de un
formulario con su etiqueta flotante (`shared/ui/atoms/field.tsx`), el bloque
dentro de una tarjeta (`shared/ui/atoms/block.tsx`) y la barra de progreso
(`shared/ui/atoms/progress.tsx`).

Lo que no puede ser un componente —porque hace falta un `<label>` o un
`<button>` en vez de un `<div>`— exporta su CLASE, como hacen `BLOCK` y
`FLOATING_SURFACE`. Sigue siendo un solo sitio donde cambia el aspecto.

Dos copias empiezan iguales y se separan: una aprende a marcar lo que
falta por clasificar y la otra no, y la misma plata acaba viéndose
distinta según por dónde se entre.

## 18. El foco se pinta cuando se pide

**Regla:** Nada nace enfocado; la señal de foco se escribe solo con `:focus-visible`, y un botón no lleva ninguna.

**Ningún campo nace enfocado**, y la señal de foco —el anillo, el borde
teñido, la etiqueta verde— **solo se escribe con `:focus-visible`**. Nunca
con `:focus` ni con `:focus-within`.

**Por qué.** `:focus` se enciende también cuando el foco lo pone el
programa: al abrir una ficha, al cerrar un desplegable que lo devuelve a su
botón, al aparecer un formulario. El resultado es una pantalla que arranca
con algo encendido que nadie eligió: el ojo va solo al sitio equivocado, y
un campo encendido sin motivo se parece demasiado a un campo con error.

**Y un BOTÓN no lleva ninguna.** Ni anillo ni contorno. Un botón se pulsa y
pasa algo: no guarda nada ni recibe lo que se escribe, así que no hay nada
en él que señalar. Y el foco le vuelve solo cada vez que se cierra lo que
abrió —una ficha, un desplegable—; si se cerró con Escape, la última
interacción fue de teclado y `:focus-visible` se enciende, así que el
contorno aparecía al SALIR de otra cosa.

Lo quita una sola línea en `index.css` —`button:focus-visible { outline:
none }`—, porque la regla base dibuja ese contorno sobre cualquier cosa que
reciba el foco. Lo llevan los que sí guardan algo o sin él no se pueden
recorrer: los campos, la casilla y el interruptor —que son `<input>`— y la
gráfica de tendencia, que entra en el orden del tabulador y se recorre con
las flechas.

**Dónde vive.** `FIELD_FOCUS`, en `shared/ui/foundations/field.ts`, y lo usan el
`Input`, el `Textarea` y `fieldTrigger()`. Es el borde del anillo al
60 % y un halo al 20 %: **un solo píxel de trazo**, el mismo que el campo ya
tenía en reposo, cambiando de color y no de grosor. Estuvo a plena tinta
—borde y anillo, dos píxeles de verde saturado— y con cuatro campos en una
ficha el enfocado no se leía como enfocado sino como marcado.

Lo que es error va a plena tinta: es la excepción, y tiene que verse desde
el otro lado de la ficha.

**Lo que la regla NO dice es dónde está el cursor.** Son dos cosas, y se
escriben distinto. Es justo lo que se había perdido en la etiqueta flotante:

| Qué                   | Selector         | Por qué                                                                       |
| --------------------- | ---------------- | ----------------------------------------------------------------------------- |
| **Subir** la etiqueta | `:focus-within`  | Es estructural: si no sube, lo que se escribe se pisa con el nombre del campo |
| **Teñirla**           | `:focus-visible` | Eso ya es la señal                                                            |

Con las dos en `:focus-within` se contradecían en el caso más corriente de
todos: al pulsar un desplegable con el ratón, un `<button>` no coincide con
`:focus-visible` —los navegadores lo reservan al teclado—, así que la caja
no pintaba su anillo y la etiqueta sí se ponía verde.

**Y una superficie con velo mete el foco en su CAJA**, no en su primer
control (`shared/lib/focus.ts`). Tiene que entrar —si se queda detrás del velo, el
tabulador recorre una página que no se ve—, pero la caja lleva
`tabindex="-1"`: recibe el foco sin encender nada, y el primer Tab lleva al
primer control de dentro.

**La única excepción es un BUSCADOR que aparece porque se pidió buscar**
—la paleta de páginas, la caja de la lupa, el filtro de un `Combo`—. Ahí el
campo no se abre con la pantalla sino con el gesto, y pedir buscar y tener
que pulsar además la caja son dos gestos para una sola intención. Un
formulario no entra nunca: una ficha se abre para leerla antes que para
rellenarla, y el campo que el programa decida encender no tiene por qué ser
el que se venía a cambiar.

`shared/lib/focus.test.ts` lee el código fuente y falla si aparece un `autoFocus`
fuera de esa lista, si alguien mueve el foco a mano al abrir algo, si la
señal se escribe con `focus:`, si un botón vuelve a dibujar un anillo, o si
desaparece la línea que los exime del contorno.
