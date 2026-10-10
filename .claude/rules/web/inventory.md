---
paths:
  - 'frontend/src/**'
---

# Inventario de `shared/ui`

Se actualiza en el mismo PR que crea o cambia un componente.

| Componente                       | Nivel      | Para qué                                                                                                       |
| -------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `foundations/field.ts`           | fundamento | Contexto «dentro de un campo», hueco de la etiqueta, `FIELD_FOCUS`, `fieldTrigger`                             |
| `foundations/surface.ts`         | fundamento | Color, tinta, sombra y canto de lo que flota; `HIGHLIGHT` y `SURGE`                                            |
| `atoms/add-surface.tsx`          | átomo      | El hueco punteado de «agregar» (`AddSurface`): `slot`, `bar` o `row`                                           |
| `atoms/alert.tsx`                | átomo      | Aviso en línea: error o información; `ErrorAlert` con su lista de detalles                                     |
| `atoms/badge.tsx`                | átomo      | `Tag`, `Chip` y `Badge`: rótulos cortos con el color de su papel                                               |
| `atoms/bar-slot.tsx`             | átomo      | Los huecos de la barra de abajo: `BarSlotLink`, `BarSlotButton`, `BarIcon` y `BarFab`                          |
| `atoms/block.tsx`                | átomo      | El bloque dentro de una tarjeta (`BLOCK` para un `<label>` o `<button>`)                                       |
| `atoms/button.tsx`               | átomo      | El botón; su tamaño lo decide `size`                                                                           |
| `atoms/page-header.tsx`          | átomo      | Título, ayuda, raya y acciones de una pantalla; `PAGE_TITLE`                                                   |
| `atoms/field.tsx`                | átomo      | Envoltorio con la etiqueta flotante de cualquier control                                                       |
| `atoms/card-row.tsx`             | átomo      | Fila pulsable de una lista dentro de una tarjeta (`CardRow`): un pago pendiente                                |
| `atoms/card.tsx`                 | átomo      | La tarjeta: material apoyado en el pozo, sin borde                                                             |
| `atoms/checkbox.tsx`             | átomo      | Casilla de verificación propia                                                                                 |
| `atoms/icon-chip.tsx`            | átomo      | Icono en su pastilla de color                                                                                  |
| `atoms/collapsible-header.tsx`   | átomo      | Cabecera de una tarjeta que se pliega, con su galón (`CollapsibleHeader`)                                      |
| `atoms/donut.tsx`                | átomo      | Gráfica de dona con su pista flotante                                                                          |
| `atoms/drop-surface.tsx`         | átomo      | El cuadro donde se sueltan o se eligen archivos (`DropSurface`)                                                |
| `atoms/empty-state.tsx`          | átomo      | Lo que se ve cuando una lista no tiene nada                                                                    |
| `atoms/file-picker.tsx`          | átomo      | El campo de archivos del navegador, escondido (`FilePicker`)                                                   |
| `atoms/icons.tsx`                | átomo      | Los iconos que se eligen para una categoría                                                                    |
| `atoms/input.tsx`                | átomo      | Campo de texto con iconos informativos y acciones (`FieldAction`)                                              |
| `atoms/switch.tsx`               | átomo      | Interruptor de encendido y apagado; `isLoading` mientras guarda                                                |
| `atoms/level-nav.tsx`            | átomo      | Moverse por un árbol: volver (`BackCrumb`) y bajar (`DrillButton`)                                             |
| `atoms/logo.tsx`                 | átomo      | El logotipo, entero y compacto                                                                                 |
| `atoms/amount.tsx`               | átomo      | Una cifra de dinero con su `direction` —entra, sale, se mueve— (`Amount`) y un saldo (`Balance`)               |
| `atoms/option.tsx`               | átomo      | La fila de una lista (`Option`) y el «crear» de su pie (`CreateOption`): select, combo y buscador de conceptos |
| `atoms/pager.tsx`                | átomo      | Paginador de una tabla                                                                                         |
| `atoms/bottom-sheet.tsx`         | átomo      | La hoja que sube desde abajo en el teléfono                                                                    |
| `atoms/panel-row.tsx`            | átomo      | Fila de 48 de un panel (`PanelRow`, tono `danger`); `PANEL_ROW_CLASS` para un enlace                           |
| `atoms/pdf-canvas.tsx`           | átomo      | La primera página de un PDF en un lienzo (`PdfCanvas`): miniatura o previsualización                           |
| `atoms/pdf-page.tsx`             | átomo      | Una página de un PDF al tamaño del zoom, sobre el velo de un visor (`PdfPage`)                                 |
| `atoms/password-policy.tsx`      | átomo      | Lo que una contraseña tiene que cumplir, y si lo cumple                                                        |
| `atoms/progress.tsx`             | átomo      | Barra de progreso                                                                                              |
| `atoms/rail-toggle.tsx`          | átomo      | Plegar y desplegar el riel (`RailToggle`)                                                                      |
| `atoms/search-box.tsx`           | átomo      | La caja de filtrar una lista a la vista (`SearchBox`): `header` o `box`                                        |
| `atoms/skeleton.tsx`             | átomo      | Hueco de carga                                                                                                 |
| `atoms/text-button.tsx`          | átomo      | Acción que se lee como texto (`TextButton`): `primary`, `subtle` o `highlight`                                 |
| `atoms/text-link.tsx`            | átomo      | Enlace dentro de una frase, subrayado en reposo (`TextLink`)                                                   |
| `atoms/textarea.tsx`             | átomo      | Campo de texto de varias líneas                                                                                |
| `atoms/tile.tsx`                 | átomo      | Baldosa de la rejilla de atajos: `tileClass`, `MovableTile` y `TileRemove`                                     |
| `atoms/toggle-option.tsx`        | átomo      | Opción de una lista corta que se enciende (`ToggleOption`): los atajos de rango                                |
| `atoms/tooltip.tsx`              | átomo      | Pista al pasar por encima (`WithTooltip`), anunciada con `aria-describedby`                                    |
| `molecules/toast.tsx`            | molécula   | Avisos flotantes de la esquina: `showToast` y su pila                                                          |
| `molecules/calendar.tsx`         | molécula   | El calendario de los selectores de fecha: un día o un rango                                                    |
| `molecules/money-field.tsx`      | molécula   | Campo de importe con separador de miles                                                                        |
| `molecules/icon-grid.tsx`        | molécula   | La rejilla de iconos de una categoría (`IconGrid`)                                                             |
| `molecules/link-row.tsx`         | molécula   | Fila de una hoja que lleva a una página (`LinkRow`)                                                            |
| `molecules/menu-rich-option.tsx` | molécula   | Opción de menú con pastel y línea de ayuda (`MenuRichOption`)                                                  |
| `molecules/menu.tsx`             | molécula   | Base de todo desplegable: abrir, cerrar, Escape y colocarse; `width` con nombre                                |
| `molecules/modal-parts.tsx`      | molécula   | Cabecera, cuerpo, pie y ancho de una ficha (`MODAL_PANEL`, `ModalBody`)                                        |
| `molecules/overlay-control.tsx`  | molécula   | Mandos sobre un documento o un velo (`OverlayButton`, `ControlSeparator`, `ControlReadout`)                    |
| `molecules/section.tsx`          | molécula   | Una parte de una ficha con su nombre encima (`Section`)                                                        |
| `molecules/table.tsx`            | molécula   | Tabla, filas, celdas, pie y esqueleto                                                                          |
| `organisms/combo.tsx`            | organismo  | Desplegable con filtro y, si se pide, «crear»; la caja es un `combobox` con `aria-activedescendant`            |
| `organisms/confirmation.tsx`     | organismo  | La ficha que pregunta antes de algo irreversible                                                               |
| `organisms/modal.tsx`            | organismo  | El armazón de una ficha                                                                                        |
| `organisms/select.tsx`           | organismo  | El desplegable que reemplaza a `<select>`: un `combobox` de solo selección con `aria-activedescendant`         |
