# Coco — reglas de la interfaz

## 1. Ningún control del sistema operativo

**Nunca** se usa el desplegable ni el selector de fecha nativos. Ni
`<select>` con su lista, ni `<input type="date">`, ni `type="time"`,
ni `type="color"`.

**Por qué.** Esos controles los dibuja el sistema operativo: su tipografía,
sus colores, su idioma y sus convenciones —la semana empezando en domingo,
el triángulo negro pegado al borde—. La misma pantalla se ve distinta en
cada máquina, y en medio de un formulario verde aparece un cuadro gris de
Windows.

**Qué se usa en su lugar.** Todo desplegable se construye sobre
`components/menu.tsx`, que es el que sabe abrir, cerrar al tocar fuera,
cerrar con Escape y colocarse. Encima de él:

| En vez de | Va |
|---|---|
| `<select>` | `components/ui/select.tsx` |
| `<input type="date">` | `components/selector-de-dia.tsx` (un día) o `components/selector-de-rango.tsx` (dos) |
| cualquier menú | `components/menu.tsx` |

El calendario de los dos selectores de fecha es el mismo:
`components/calendario.tsx`. Un extremo pinta un día, dos pintan un rango.

## 2. El tamaño de un botón lo decide el botón

El alto, el radio y el peso de la letra viven en `size` dentro de
`components/ui/button.tsx`. Una llamada **nunca** los escribe en su
`className`; si hace falta una medida nueva, se añade un `size`.

Hay una prueba que lee el código fuente y falla si alguien lo hace:
`components/ui/button.llamadas.test.ts`.

## 3. El radio estándar es 10px

`rounded-lg`, que es el `--radius` del tema. Lo usan las tarjetas, los
desplegables, los modales, las tablas y los campos. Puede ser **menor**
donde haga falta —una casilla, un chip— pero **nunca mayor**: dos
contenedores vecinos con esquinas distintas se leen como dos sistemas
distintos.

Hay una prueba que lee el código fuente y falla si aparece un
`rounded-xl`, `rounded-2xl`, `rounded-3xl` o un radio arbitrario por
encima de 10px: `components/ui/radio.test.ts`.

La escala crece en orden: `sm` 6, `md` 8, `lg` 10, `xl` 14. El `2xl` y el
`3xl` de Tailwind no leen el tema —valen 16 y 24 fijos— y por eso están
prohibidos.

## 3 bis. Dos tamaños, y los mismos para todo

Un botón, un campo de texto, un desplegable y un selector de fecha miden
lo mismo: `sm` 36px y `md` 44px. Una fila donde el botón mide 40, el campo
42 y el selector 36 se ve temblorosa aunque nadie sepa decir por qué.

Las variantes de icono —`sm-icon`, `md-icon`— son esas mismas alturas en
cuadrado. No son un tamaño más.

## 4. El color vive en `index.css`, y se nombra por su papel

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

## 4 bis. Nada de mayúsculas sostenidas

Una palabra en versalitas pierde la silueta que la hace reconocible
—"Soporte" y "SOPORTE" no se leen igual de rápido— y donde todo el texto
es corto, un rótulo gritando compite con lo que titula. El tamaño y el
gris ya dicen que es un rótulo.

Vale para los modales, para los rótulos de los indicadores del resumen y
para los grupos de secciones del riel. El interletraje abierto que suele
acompañarlas también se va: el tema lo declara en cero y Geist ya viene
cerrada de por sí.

## 4 ter. `accent` es lo que responde; `muted` es lo que está quieto

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

## 4 quater. Lo que flota se dibuja en un solo sitio

Un desplegable, un calendario, un modal, una confirmación, la pista de una
gráfica y el aviso de una esquina comparten `SUPERFICIE_FLOTANTE`
(`components/ui/superficie.ts`): color, tinta, sombra y canto.

El canto es **obligatorio** y sale del borde del tema. La sombra sola no
delimita en ningún modo: en claro el popover es blanco sobre un lienzo
casi blanco, y en oscuro la sombra es negra sobre un fondo casi negro.

Una sombra sobre algo que ya tiene color no es una superficie flotante: es
un objeto que se levanta —una ficha mientras se arrastra— y esa sí puede
escribirse suelta.

`components/ui/superficie.test.ts` lee el código fuente y falla si alguien
vuelve a escribir la sombra a mano o a separar un panel con un negro o un
blanco inventados.

## 5. El rojo es solo para errores

Lo pendiente —un movimiento sin clasificar— va en el oro del tema
(`warning`, que sale de su `secondary`). El rojo se reserva a lo que de
verdad salió mal y a lo que no se puede deshacer.

## 6. Componentes, no copias

Si algo aparece en dos pantallas, es un componente. La tabla de
movimientos, el paginador, la barra de filtros, el calendario, la dona, la
cabecera de una pantalla (`components/cabecera-de-pagina.tsx`) y el bloque
dentro de una tarjeta (`components/ui/bloque.tsx`) lo son.

Lo que no puede ser un componente —porque hace falta un `<label>` o un
`<button>` en vez de un `<div>`— exporta su CLASE, como hacen `BLOQUE` y
`SUPERFICIE_FLOTANTE`. Sigue siendo un solo sitio donde cambia el aspecto.

Dos copias empiezan iguales y se separan: una aprende a marcar lo que
falta por clasificar y la otra no, y la misma plata acaba viéndose
distinta según por dónde se entre.
