---
paths:
  - 'frontend/src/**'
---

# La web

Lo de la web está partido por tema en [`web/`](web/). Cada archivo se carga solo
al trabajar en `frontend/src/`, y si una prueba protege una regla, no se desactiva.

| Archivo                                                      | Qué trae                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [`web/structure.md`](web/structure.md)                       | Las tres capas, el contrato con la API, los textos, `shared/ui` y cómo se compone        |
| [`web/inventory.md`](web/inventory.md)                       | Cada componente de `shared/ui`, su nivel y para qué es (se actualiza en el mismo PR)     |
| [`web/ui-surfaces.md`](web/ui-surfaces.md)                   | Reglas de la interfaz 1 a 9: controles, medidas, radio, color, superficies, lo que flota |
| [`web/ui-sheets-and-fields.md`](web/ui-sheets-and-fields.md) | Reglas 10 a 14: la cabecera de una pantalla, las fichas, los campos y los avisos         |
| [`web/ui-records-and-focus.md`](web/ui-records-and-focus.md) | Reglas 15 a 18: movimientos y conceptos, el rojo, componentes y no copias, el foco       |

## Las 18 reglas de la interfaz

|     | Regla                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | [Ningún control del sistema operativo](web/ui-surfaces.md#1-ningún-control-del-sistema-operativo)                                                |
| 2   | [El tamaño de un botón lo decide el botón](web/ui-surfaces.md#2-el-tamaño-de-un-botón-lo-decide-el-botón)                                        |
| 3   | [El radio estándar es 10px](web/ui-surfaces.md#3-el-radio-estándar-es-10px)                                                                      |
| 4   | [Dos tamaños, y los mismos para todo](web/ui-surfaces.md#4-dos-tamaños-y-los-mismos-para-todo)                                                   |
| 5   | [El color vive en `index.css`, y se nombra por su papel](web/ui-surfaces.md#5-el-color-vive-en-indexcss-y-se-nombra-por-su-papel)                |
| 6   | [Tres superficies: el material, el pozo y lo elegido](web/ui-surfaces.md#6-tres-superficies-el-material-el-pozo-y-lo-elegido)                    |
| 7   | [Nada de mayúsculas sostenidas](web/ui-surfaces.md#7-nada-de-mayúsculas-sostenidas)                                                              |
| 8   | [`accent` es lo que responde; `muted` es lo que está quieto](web/ui-surfaces.md#8-accent-es-lo-que-responde-muted-es-lo-que-está-quieto)         |
| 9   | [Lo que flota se dibuja en un solo sitio](web/ui-surfaces.md#9-lo-que-flota-se-dibuja-en-un-solo-sitio)                                          |
| 10  | [La cabecera de una pantalla](web/ui-sheets-and-fields.md#10-la-cabecera-de-una-pantalla)                                                        |
| 11  | [La cabecera y el pie de una ficha](web/ui-sheets-and-fields.md#11-la-cabecera-y-el-pie-de-una-ficha)                                            |
| 12  | [Una ficha mide 720px, y dentro reparte a la mitad](web/ui-sheets-and-fields.md#12-una-ficha-mide-720px-y-dentro-reparte-a-la-mitad)             |
| 13  | [El nombre de un campo va DENTRO, y flota](web/ui-sheets-and-fields.md#13-el-nombre-de-un-campo-va-dentro-y-flota)                               |
| 14  | [Un aviso flotante dice su severidad de tres maneras](web/ui-sheets-and-fields.md#14-un-aviso-flotante-dice-su-severidad-de-tres-maneras)        |
| 15  | [Un movimiento es un REGISTRO; el concepto es estructura](web/ui-records-and-focus.md#15-un-movimiento-es-un-registro-el-concepto-es-estructura) |
| 16  | [El rojo es solo para errores](web/ui-records-and-focus.md#16-el-rojo-es-solo-para-errores)                                                      |
| 17  | [Componentes, no copias](web/ui-records-and-focus.md#17-componentes-no-copias)                                                                   |
| 18  | [El foco se pinta cuando se pide](web/ui-records-and-focus.md#18-el-foco-se-pinta-cuando-se-pide)                                                |
