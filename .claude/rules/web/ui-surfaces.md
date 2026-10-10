---
paths:
  - 'frontend/src/**'
---

# Reglas de la interfaz, 1 a 9: controles, medidas, color y superficies

Las rutas son relativas a `frontend/src/`. Cada regla va arriba, en una línea;
el porqué, debajo. Si una prueba la protege, no se desactiva.

## 1. Ningún control del sistema operativo

**Regla:** Nunca `<select>` ni `<input type="date|time|color">`: todo desplegable se construye sobre `menu.tsx`.

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

Vive en `shared/ui/atoms/button.tsx`; si hace falta una medida nueva, se
añade un `size`. `shared/ui/atoms/button.calls.test.ts` lee el código fuente y
falla si una llamada la escribe.

## 3. El radio estándar es 10px

**Regla:** El radio es `rounded-lg` (10px): menor donde haga falta, nunca mayor salvo lo registrado en `ALLOWED`.

Es el `--radius` del tema, y lo usan las tarjetas, los desplegables, los
modales, las tablas y los campos. Menor —una casilla, un chip— sí; mayor no:
dos contenedores vecinos con esquinas distintas se leen como dos sistemas
distintos. `shared/ui/radius.test.ts` falla si aparece un `rounded-xl`,
`rounded-2xl`, `rounded-3xl` o un radio arbitrario por encima de 10px.

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

Una fila donde el botón mide 40, el campo 42 y el selector 36 se ve
temblorosa aunque nadie sepa decir por qué. Las variantes de icono
—`sm-icon`, `md-icon`— no son un tamaño más.

## 5. El color vive en `index.css`, y se nombra por su papel

**Regla:** Ningún color a mano: los tokens viven en `index.css` y se nombran por su papel, no por su tono.

Los tokens del tema —Solstice— están en una sola capa de `index.css`; si
hace falta uno que el tema no da, se añade ahí con su razón. Y se nombran por lo que SIGNIFICAN, no por el color que tienen hoy. Los
chips eran `violeta`, `turquesa`, `verde` y `lima`; al cambiar de tema el
del gasto pasó a pino y el nombre se volvió mentira. Ahora son `expense`,
`income`, `budget` y `transactions`, y un tema nuevo no obliga a
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
