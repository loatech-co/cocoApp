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

Hoy son `admin`, `auth`, `bank-accounts`, `centros`, `profile` y
`transactions`.

**Las features no se importan entre sí: lo común sube a `shared/`.**

Un enlace escondido entre dos dominios es el que nadie recuerda al cambiar
uno. Ejemplos: el árbol de categorías lo usan centros y movimientos, y está en
`shared/api/categories.ts`; la política de contraseña la usan auth, admin y
perfil, y está en `shared/ui/atoms/politica-de-contrasena.tsx`; la lista de
secciones la usan el armazón y Mi cuenta, y está en `shared/lib/sections.ts`.

**`shared/` nunca importa de `features/`.**

Si lo hiciera, dejaría de ser compartido: arrastraría un dominio a todos los
demás.

**`shared/lib` es el suelo: no dibuja ni pide datos.**

Fechas, formato de dinero, foco, gestos, el puente con la app. Si algo de
`lib/` necesita la sesión, es de `shared/api` (por eso `registrarPuente` vive
en `shared/api/native-bridge.ts` y no en `shared/lib/puente-nativo.ts`).

## La interfaz: `shared/ui`

**`shared/ui` dibuja lo que le dan: ni React Query, ni `api-client`, ni sesión.**

Un componente que pide sus datos solo sirve donde esos datos existen y solo se
prueba con un servidor. Lo que sabe qué es un movimiento, un concepto o un
soporte es un organismo de dominio y vive en `features/<dominio>/components/`,
con sus datos en el `api/` de su feature: `PanelDeBusqueda` usa
`useTransactions`, `TablaDeMovimientos` usa `useActualizarMovimiento`.

**El nivel de un componente es el más bajo que permiten sus importaciones.**

Un nivel decidido por opinión se discute en cada componente; uno decidido por
lo que importa lo comprueba una máquina.

| Nivel        | Puede usar                                | Ejemplos en Coco                                               |
| ------------ | ----------------------------------------- | -------------------------------------------------------------- |
| `atoms/`     | ningún otro componente de `shared/ui`     | `Button`, `Input`, `Campo`, `Casilla`, `PanelInferior`, `Dona` |
| `molecules/` | solo átomos                               | `Menu` (Button + PanelInferior), `ModalPartes` (Button)        |
| `organisms/` | moléculas y átomos, nunca otro organismo  | `Select` (Menu + Campo), `Confirmacion` (ModalPartes + Button) |
| `templates/` | organismos, moléculas y átomos, sin datos | Ninguna todavía                                                |

Que `PanelInferior` o `Dona` sean átomos no dice que sean pequeños: dice que no
se apoyan en ninguna otra pieza, así que cambiar otra pieza no los cambia.

**`shared/ui/foundations/` es lo que todos los niveles pueden usar, y no es un
componente.**

Clases y contextos sin marcado: `SUPERFICIE_FLOTANTE` (`superficie.ts`) y el
contexto del campo con `FOCO_DEL_CAMPO` (`field.ts`). Sin esta carpeta, `Input`
sería una molécula solo por leer el contexto de `Campo`.

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
`ancho` en `Menu`—, no un `className` donde se usa. La llamada puede COLOCAR la
pieza (un margen, una celda de la rejilla); no la viste. Por eso las piezas
nuevas no aceptan `className`.

**Ante algo nuevo: combinar lo que existe → añadir una variante → crear un
componente en el nivel más bajo posible, con su historia en el catálogo.**

**Una excepción se registra con su motivo en un solo sitio, o no existe.**

Para estas dos reglas, `DESIGN_EXCEPTIONS` en `eslint.config.js`; el lint
falla también si una entrada ya no la usa nadie. El suelo táctil
(`movil:min-h-[42px]`) tiene su propio registro en
`shared/ui/piso-tactil.test.ts`, y el radio por encima de 10px en
`shared/ui/radio.test.ts`.

Un `var(--token)` no es arbitrario —lee el tema— y un escalón de la escala
tampoco: `min-h-55` son 220px y `size-4.5` son 18. Lo que el tema no tiene se
añade en `index.css` con su razón (`leading-portada`, `pb-seguro`).

## Inventario de `shared/ui`

Se actualiza en el mismo PR que crea o cambia un componente.

| Componente                         | Nivel      | Para qué                                                                                          |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `foundations/field.ts`             | fundamento | Contexto «dentro de un campo», hueco de la etiqueta, `FOCO_DEL_CAMPO`, `disparadorDeCampo`        |
| `foundations/superficie.ts`        | fundamento | Color, tinta, sombra y canto de lo que flota; `REALCE` y `SURGE`                                  |
| `atoms/add-surface.tsx`            | átomo      | El hueco punteado de «agregar» (`AddSurface`): `hueco`, `barra` o `fila`                          |
| `atoms/alert.tsx`                  | átomo      | Aviso en línea: error o información; `ErrorAlert` con su lista de detalles                        |
| `atoms/badge.tsx`                  | átomo      | `Etiqueta`, `Chip` y `Badge`: rótulos cortos con el color de su papel                             |
| `atoms/bar-slot.tsx`               | átomo      | Los huecos de la barra de abajo: `BarSlotLink`, `BarSlotButton`, `BarIcon` y `BarFab`             |
| `atoms/bloque.tsx`                 | átomo      | El bloque dentro de una tarjeta (`BLOQUE` para un `<label>` o `<button>`)                         |
| `atoms/button.tsx`                 | átomo      | El botón; su tamaño lo decide `size`                                                              |
| `atoms/cabecera-de-pagina.tsx`     | átomo      | Título, ayuda, raya y acciones de una pantalla; `TITULO_DE_PAGINA`                                |
| `atoms/campo.tsx`                  | átomo      | Envoltorio con la etiqueta flotante de cualquier control                                          |
| `atoms/card-row.tsx`               | átomo      | Fila pulsable de una lista dentro de una tarjeta (`CardRow`): un pago pendiente                   |
| `atoms/card.tsx`                   | átomo      | La tarjeta: material apoyado en el pozo, sin borde                                                |
| `atoms/casilla.tsx`                | átomo      | Casilla de verificación propia                                                                    |
| `atoms/chip-icono.tsx`             | átomo      | Icono en su pastilla de color                                                                     |
| `atoms/collapsible-header.tsx`     | átomo      | Cabecera de una tarjeta que se pliega, con su galón (`CollapsibleHeader`)                         |
| `atoms/dona.tsx`                   | átomo      | Gráfica de dona con su pista flotante                                                             |
| `atoms/drop-surface.tsx`           | átomo      | El cuadro donde se sueltan o se eligen archivos (`DropSurface`)                                   |
| `atoms/estado-vacio.tsx`           | átomo      | Lo que se ve cuando una lista no tiene nada                                                       |
| `atoms/file-picker.tsx`            | átomo      | El campo de archivos del navegador, escondido (`FilePicker`)                                      |
| `atoms/iconos.tsx`                 | átomo      | Los iconos que se eligen para una categoría                                                       |
| `atoms/input.tsx`                  | átomo      | Campo de texto con iconos informativos y acciones (`FieldAction`)                                 |
| `atoms/interruptor.tsx`            | átomo      | Interruptor de encendido y apagado; `cargando` mientras guarda                                    |
| `atoms/level-nav.tsx`              | átomo      | Moverse por un árbol: volver (`BackCrumb`) y bajar (`DrillButton`)                                |
| `atoms/logo.tsx`                   | átomo      | El logotipo, entero y compacto                                                                    |
| `atoms/monto.tsx`                  | átomo      | Una cifra de dinero con su `sentido` —entra, sale, se mueve— (`Monto`) y un saldo (`Saldo`)       |
| `atoms/paginador.tsx`              | átomo      | Paginador de una tabla                                                                            |
| `atoms/panel-inferior.tsx`         | átomo      | La hoja que sube desde abajo en el teléfono                                                       |
| `atoms/panel-row.tsx`              | átomo      | Fila de 48 de un panel (`PanelRow`, tono `peligro`); `FILA_DE_PANEL` para un enlace               |
| `atoms/pdf-canvas.tsx`             | átomo      | La primera página de un PDF en un lienzo (`LienzoPdf`): miniatura o previsualización              |
| `atoms/pdf-page.tsx`               | átomo      | Una página de un PDF al tamaño del zoom, sobre el velo de un visor (`PaginaPdf`)                  |
| `atoms/politica-de-contrasena.tsx` | átomo      | Lo que una contraseña tiene que cumplir, y si lo cumple                                           |
| `atoms/progreso.tsx`               | átomo      | Barra de progreso                                                                                 |
| `atoms/rail-toggle.tsx`            | átomo      | Plegar y desplegar el riel (`RailToggle`)                                                         |
| `atoms/search-box.tsx`             | átomo      | La caja de filtrar una lista a la vista (`SearchBox`): `cabecera` o `caja`                        |
| `atoms/skeleton.tsx`               | átomo      | Hueco de carga                                                                                    |
| `atoms/text-button.tsx`            | átomo      | Acción que se lee como texto (`TextButton`): `primario`, `tenue` o `realce`                       |
| `atoms/text-link.tsx`              | átomo      | Enlace dentro de una frase, subrayado en reposo (`TextLink`)                                      |
| `atoms/textarea.tsx`               | átomo      | Campo de texto de varias líneas                                                                   |
| `atoms/tile.tsx`                   | átomo      | Baldosa de la rejilla de atajos: `tileClass`, `MovableTile` y `TileRemove`                        |
| `atoms/toggle-option.tsx`          | átomo      | Opción de una lista corta que se enciende (`ToggleOption`): los atajos de rango                   |
| `atoms/tooltip.tsx`                | átomo      | Pista al pasar por encima (`ConTooltip`), anunciada con `aria-describedby`                        |
| `molecules/aviso.tsx`              | molécula   | Avisos flotantes de la esquina: `mostrarAviso` y su pila                                          |
| `molecules/calendario.tsx`         | molécula   | El calendario de los selectores de fecha: un día o un rango                                       |
| `molecules/campo-de-dinero.tsx`    | molécula   | Campo de importe con separador de miles                                                           |
| `molecules/icon-grid.tsx`          | molécula   | La rejilla de iconos de una categoría (`IconGrid`)                                                |
| `molecules/link-row.tsx`           | molécula   | Fila de una hoja que lleva a una página (`FilaDeEnlace`)                                          |
| `molecules/menu-rich-option.tsx`   | molécula   | Opción de menú con pastel y línea de ayuda (`MenuOpcionDetallada`)                                |
| `molecules/menu.tsx`               | molécula   | Base de todo desplegable: abrir, cerrar, Escape y colocarse; `ancho` con nombre                   |
| `molecules/modal-partes.tsx`       | molécula   | Cabecera, cuerpo, pie y ancho de una ficha (`PANEL_DE_MODAL`, `CuerpoDeModal`)                    |
| `molecules/overlay-control.tsx`    | molécula   | Mandos sobre un documento o un velo (`BotonOscuro`, `SeparadorDeMandos`, `LecturaDeMandos`)       |
| `molecules/section.tsx`            | molécula   | Una parte de una ficha con su nombre encima (`Seccion`)                                           |
| `molecules/tabla.tsx`              | molécula   | Tabla, filas, celdas, pie y esqueleto                                                             |
| `organisms/combo.tsx`              | organismo  | Desplegable con filtro y, si se pide, «crear» (`CreateOption`, también del buscador de conceptos) |
| `organisms/confirmacion.tsx`       | organismo  | La ficha que pregunta antes de algo irreversible                                                  |
| `organisms/modal.tsx`              | organismo  | El armazón de una ficha                                                                           |
| `organisms/select.tsx`             | organismo  | El desplegable que reemplaza a `<select>`                                                         |

## Dónde quedó lo que `CLAUDE.md` nombra con su ruta vieja

| Ruta vieja                          | Ruta nueva                                               |
| ----------------------------------- | -------------------------------------------------------- |
| `components/ui/<x>`                 | `shared/ui/<nivel>/<x>` (ver inventario)                 |
| `components/menu.tsx`               | `shared/ui/molecules/menu.tsx`                           |
| `components/calendario.tsx`         | `shared/ui/molecules/calendario.tsx`                     |
| `components/selector-de-fecha.tsx`  | `features/transactions/components/selector-de-fecha.tsx` |
| `components/cabecera-de-pagina.tsx` | `shared/ui/atoms/cabecera-de-pagina.tsx`                 |
| `components/panel-inferior.tsx`     | `shared/ui/atoms/panel-inferior.tsx`                     |
| `FOCO_DEL_CAMPO` en `campo.tsx`     | `shared/ui/foundations/field.ts`                         |
| `lib/foco.ts`, `lib/foco.test.ts`   | `shared/lib/foco.ts`, `shared/lib/foco.test.ts`          |
| `lib/movimientos.ts`                | `features/transactions/model/movimientos.ts`             |
| `lib/queries.ts`                    | el `api/` de cada feature, y `shared/api/` lo común      |
