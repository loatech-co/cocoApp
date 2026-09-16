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

## 3. El radio estándar es 16px

`rounded-2xl`. Lo usan las tarjetas, los desplegables, los modales y las
tablas. Puede ser **menor** donde haga falta —una casilla, un chip, un
botón— pero **nunca mayor**: dos contenedores vecinos con esquinas
distintas se leen como dos sistemas distintos.

Hay una prueba que lee el código fuente y falla si aparece un
`rounded-3xl` o un radio arbitrario por encima de 16px:
`components/ui/radio.test.ts`.

Ojo con la escala de Tailwind en este proyecto: `--radius: 1rem` hace que
`rounded-lg` sea 16px y `rounded-xl` sea 20px. `rounded-2xl` es 16px por
el valor por defecto de Tailwind. No es monótona; por eso el estándar se
nombra explícitamente y hay una prueba.

## 4. Sobre lima, tinta

El texto sobre el acento lima va en tinta, nunca en blanco: blanco sobre
lima da 1.23:1 de contraste, muy por debajo del 4.5:1 que exige el texto.
Con tinta da 13.9:1.

## 5. El rojo es solo para errores

Lo pendiente —un movimiento sin clasificar— va en ámbar. El rojo se
reserva a lo que de verdad salió mal y a lo que no se puede deshacer.

## 6. Componentes, no copias

Si algo aparece en dos pantallas, es un componente. La tabla de
movimientos, el paginador, la barra de filtros, el calendario y la dona
lo son. Dos copias empiezan iguales y se separan: una aprende a marcar lo
que falta por clasificar y la otra no, y la misma plata acaba viéndose
distinta según por dónde se entre.
