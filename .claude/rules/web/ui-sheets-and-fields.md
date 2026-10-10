---
paths:
  - 'frontend/src/**'
---

# Reglas de la interfaz, 10 a 14: cabeceras, fichas, campos y avisos

Las rutas son relativas a `frontend/src/`. Cada regla va arriba, en una línea;
el porqué, debajo. Si una prueba la protege, no se desactiva.

## 10. La cabecera de una pantalla

**Regla:** Toda pantalla con contenido abre con `PageHeader`, su acción va en `size="sm"` y tiene un solo `<h1>`.

Vive en `shared/ui/atoms/page-header.tsx`; nunca un `<h1>` y un `<p>` a mano.

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

Y su icono va **sin medida propia** (`<Plus />`, no `<Plus className="size-4" />`):
el tamaño de los iconos lo pone el botón.

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

Viven en `shared/ui/molecules/modal-parts.tsx`; nunca un `<div>` a mano.

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

A la derecha porque es donde acaba de leerse un formulario, de arriba abajo y
de izquierda a derecha.

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
(`SHEET_GRID`, en `features/transactions/components/transaction-sheet-form.tsx`) y reparte mitad y mitad.

La previsualización no pasa de **350px de alto** y va sin fila de miniaturas:
contar, elegir, añadir y quitar viven sobre el propio documento, donde no
gastan alto, y para mirarlo de cerca está la pantalla completa.

Por debajo de `lg` no hay reparto: son dos filas apiladas, porque en un
teléfono dos columnas de 170px no son dos columnas.

## 13. El nombre de un campo va DENTRO, y flota

**Regla:** Todo campo va dentro de `Field`, con su etiqueta flotante dentro; nunca un `<Label>` encima de un `<Input>`.

Vive en `shared/ui/atoms/field.tsx`.

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

**Dónde vive la lógica.** En `index.css`, bajo `.campo`: son cuatro
disparadores que significan lo mismo —foco, desplegable abierto, algo escrito,
algo elegido— y con utilidades habría que repetir la posición subida en cada uno.

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
