---
paths:
  - 'frontend/src/**'
---

# Reglas de la interfaz, 15 a 18: registros, rojo, componentes y foco

Las rutas son relativas a `frontend/src/`. Cada regla va arriba, en una línea;
el porqué, debajo. Si una prueba la protege, no se desactiva.

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

Lo pendiente es, por ejemplo, un movimiento sin clasificar, y `warning` es el
verde medio del tema. La paleta es de cuatro verdes y no tiene un cálido: verde británico, lima,
turquesa y verde medio. Eso deja lo pendiente a 16° de matiz de lo que
entra, así que donde los dos puedan convivir —una fila vencida en una tabla
con ingresos— la señal no puede ser solo el color: la palabra, el signo o
el peso de la letra tienen que decirlo también.

## 17. Componentes, no copias

**Regla:** Lo que aparece en dos pantallas es un componente, o exporta su clase si no puede serlo.

Lo son la tabla de
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

La señal de foco es el anillo, el borde teñido y la etiqueta verde. Nunca se
escribe con `:focus` ni con `:focus-within`.

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
