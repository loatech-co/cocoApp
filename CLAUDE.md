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

## 5. El rojo es solo para errores

Lo pendiente —un movimiento sin clasificar— va en el oro del tema
(`warning`, que sale de su `secondary`). El rojo se reserva a lo que de
verdad salió mal y a lo que no se puede deshacer.

## 6. Componentes, no copias

Si algo aparece en dos pantallas, es un componente. La tabla de
movimientos, el paginador, la barra de filtros, el calendario y la dona
lo son. Dos copias empiezan iguales y se separan: una aprende a marcar lo
que falta por clasificar y la otra no, y la misma plata acaba viéndose
distinta según por dónde se entre.
