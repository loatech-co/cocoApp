# Coco — reglas de la interfaz

| | Regla |
|---|---|
| 1 | [Ningún control del sistema operativo](#1-ningún-control-del-sistema-operativo) |
| 2 | [El tamaño de un botón lo decide el botón](#2-el-tamaño-de-un-botón-lo-decide-el-botón) |
| 3 | [El radio estándar es 10px](#3-el-radio-estándar-es-10px) |
| 4 | [Dos tamaños, y los mismos para todo](#4-dos-tamaños-y-los-mismos-para-todo) |
| 5 | [El color vive en `index.css`, y se nombra por su papel](#5-el-color-vive-en-indexcss-y-se-nombra-por-su-papel) |
| 6 | [Tres superficies: el material, el pozo y lo elegido](#6-tres-superficies-el-material-el-pozo-y-lo-elegido) |
| 7 | [Nada de mayúsculas sostenidas](#7-nada-de-mayúsculas-sostenidas) |
| 8 | [`accent` es lo que responde; `muted` es lo que está quieto](#8-accent-es-lo-que-responde-muted-es-lo-que-está-quieto) |
| 9 | [Lo que flota se dibuja en un solo sitio](#9-lo-que-flota-se-dibuja-en-un-solo-sitio) |
| 10 | [La cabecera de una pantalla](#10-la-cabecera-de-una-pantalla) |
| 11 | [La cabecera y el pie de una ficha](#11-la-cabecera-y-el-pie-de-una-ficha) |
| 12 | [El nombre de un campo va DENTRO, y flota](#12-el-nombre-de-un-campo-va-dentro-y-flota) |
| 13 | [Un aviso flotante dice su severidad de tres maneras](#13-un-aviso-flotante-dice-su-severidad-de-tres-maneras) |
| 14 | [Un movimiento es un REGISTRO; el concepto es estructura](#14-un-movimiento-es-un-registro-el-concepto-es-estructura) |
| 15 | [El rojo es solo para errores](#15-el-rojo-es-solo-para-errores) |
| 16 | [Componentes, no copias](#16-componentes-no-copias) |
| 17 | [El foco se pinta cuando se pide](#17-el-foco-se-pinta-cuando-se-pide) |

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

**La única excepción es el pozo** —la esquina donde se abre el contenido
dentro de la página, en `app/app-shell.tsx`—, que lleva 14px. Se pasa
porque es el contenedor más grande que hay: 10px en un canto que mide toda
la altura de la ventana casi no se ve, y lo que esa esquina cuenta depende
de que se vea. No rompe la regla, que habla de contenedores VECINOS: el
pozo no es vecino de ninguna tarjeta, es el fondo de todas. Está
registrada con su motivo en `PERMITIDOS`, dentro de la misma prueba; toda
excepción nueva se escribe ahí o no existe.

## 4. Dos tamaños, y los mismos para todo

Un botón, un campo de texto, un desplegable y un selector de fecha miden
lo mismo: `sm` 36px y `md` 44px. Una fila donde el botón mide 40, el campo
42 y el selector 36 se ve temblorosa aunque nadie sepa decir por qué.

Las variantes de icono —`sm-icon`, `md-icon`— son esas mismas alturas en
cuadrado. No son un tamaño más.

## 5. El color vive en `index.css`, y se nombra por su papel

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

Había cinco escalones —riel, lienzo, tarjeta, bloque, chip— separados por
unos pocos puntos de luz. El ojo no distingue cinco grises casi iguales: lo
que veía era una pantalla lavada donde cada contenedor necesitaba un borde
para existir, y esa retícula de líneas de 1px es la firma visual de un
panel de administración de hace diez años.

Ahora son tres, y cada uno tiene un trabajo:

| Superficie | Tokens | Qué es |
|---|---|---|
| El material | `card`, `popover`, `sidebar` —el **mismo** valor— | De lo que están hechos el riel, las tarjetas y los desplegables |
| El pozo | `background` | El hueco donde se apoyan. Va por DEBAJO del material |
| Lo elegido | `muted` | Un bloque dentro de una tarjeta, la opción ya seleccionada |

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

Una palabra en versalitas pierde la silueta que la hace reconocible
—"Soporte" y "SOPORTE" no se leen igual de rápido— y donde todo el texto
es corto, un rótulo gritando compite con lo que titula. El tamaño y el
gris ya dicen que es un rótulo.

Vale para los modales, para los rótulos de los indicadores del resumen y
para los grupos de secciones del riel. El interletraje abierto que suele
acompañarlas también se va: el tema lo declara en cero y Geist ya viene
cerrada de por sí.

## 8. `accent` es lo que responde; `muted` es lo que está quieto

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

## 10. La cabecera de una pantalla

Toda pantalla con contenido abre con `components/cabecera-de-pagina.tsx`.
Nunca con un `<h1>` y un `<p>` escritos a mano.

**Por qué.** Esas tres líneas se escribieron ocho veces y salieron TRES
tipografías distintas: el resumen y los movimientos en 24/30px con la
familia de titulares, cinco pantallas en 30px plano con la del cuerpo, y
los centros de costos en 30/36. Nadie lo decidió. Y se nota al navegar,
que es lo peor: el título cambia de tamaño al pasar de una pantalla a
otra, así que la aplicación parece tres aplicaciones.

**Qué fija el componente, y no se pisa desde la llamada:**

| Pieza | Valor | Por qué |
|---|---|---|
| Título | `text-2xl sm:text-3xl`, familia de titulares, sin interletraje | Con 30px fijos, "Importar movimientos" ocupa dos renglones en un teléfono |
| Ayuda | `text-sm text-muted-foreground`, una línea | Es qué es esta pantalla, no un párrafo |
| Raya | `border-b border-border pb-4`, siempre | La llevaban dos de las ocho; el título ganaba y perdía una línea según por dónde se entrara |
| Acción | **`size="sm"`** | Ver abajo |

**La acción va en `sm`, los 36px.** No es una preferencia. En la barra de
filtros la acción principal convive con la búsqueda, el orden, el filtro y
el rango, y ahí ya está decidido que todos los controles de la fila midan
lo mismo —romperlo dejaba la fila descuadrada—. Si el botón de Centros de
costos mide 44 y el del resumen 36, la misma acción cambia de tamaño al
cambiar de pantalla.

Y su icono va **sin medida propia** (`<Plus />`, no
`<Plus className="size-4" />`): el tamaño de los iconos lo pone el botón, y
escribirlo en la llamada duplica una decisión que ya está tomada.

**Los dos huecos.** `junto` va pegado al título —un botón de ayuda, una
etiqueta de estado—; `acciones` va al extremo opuesto. Nada más entra en la
cabecera.

**Lo que NO es una pantalla con contenido.** El 404 y las dos de acceso no
tienen ayuda, ni acciones, ni contenido que separar con una raya. Usan la
clase `TITULO_DE_PAGINA` del mismo archivo, que es la tipografía sola.

**Y toda pantalla tiene exactamente un `<h1>`.** Las de acceso lo llevan en
`sr-only`, porque lo que se ve ahí es el logotipo y un SVG no puede hacer
ese papel: sin él, la única jerarquía de la página era el `<h2>` de la
tarjeta y quien navega con lector de pantalla no encontraba ninguno del que
colgaran los demás.

`components/cabecera-de-pagina.test.ts` lee el código fuente y falla si una
pantalla vuelve a escribir su propio `<h1>` o si una acción de cabecera pide
un tamaño que no sea `sm`.

## 11. La cabecera y el pie de una ficha

Toda ficha abre con `CabeceraDeModal` y cierra con `PieDeModal`
(`components/ui/modal-partes.tsx`). Nunca con un `<div>` escrito a mano.

**Por qué están fuera de `Modal`.** Porque hay DOS armazones y siempre los
va a haber: `ui/modal.tsx` sirve para las fichas que caben en su forma
—título, una línea de ayuda, una equis— y la del movimiento tiene el suyo,
porque lleva un pastel de color delante del título y un ancho distinto.
Encerradas dentro de `Modal`, la del movimiento no podía usarlas y las
copiaba.

### La cabecera

| Pieza | Dónde va |
|---|---|
| `antes` | Delante del título: el pastel de color de un movimiento |
| `titulo` | `text-lg`, familia de titulares. **Nunca en mayúsculas sostenidas** |
| `ayuda` | Debajo, `text-sm text-muted-foreground`. Una frase |
| `acciones` | Botones de icono `sm-icon` a la izquierda de la equis |

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

`components/ui/button.llamadas.test.ts` falla si un `<Button>` vuelve a
traer `flex-1`. (`w-full` sí se permite: estirar un botón a todo el ancho de
una columna angosta —el «Iniciar sesión» de una tarjeta de 384px— es otra
decisión, porque ahí no hay con quién competir.)

## 12. Una ficha mide 720px, y dentro reparte a la mitad

`PANEL_DE_MODAL`, en `components/ui/modal-partes.tsx`, topa el ancho de
**todas** las fichas en 720px. Una llamada puede pedir menos —la
confirmación mide `max-w-md`— pero **nunca más**.

**Por qué.** La ficha del movimiento llegaba a 1024 porque su columna del
soporte pedía sitio. Una ventana de 1024 dentro de una pantalla de 1440
deja de leerse como algo que está ENCIMA de la aplicación y empieza a
leerse como otra pantalla.

**Relleno: 16px por los cuatro lados**, y lo mismo en la cabecera y en el
pie. Eran 24 y sobraban: en una ficha topada a 720, ese marco se comía el
ancho que necesitan dos columnas. Vive en `Modal`, en `CabeceraDeModal` y
en `Confirmacion` —una llamada no lo escribe—, porque dos sangrados
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

Todo campo de formulario se envuelve en `components/ui/campo.tsx`. Nunca un
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
`useDentroDeUnCampo()`. Hay cinco estructuras distintas —un `<input>`
suelto, uno con iconos en absoluto, un `<textarea>`, el disparador de un
desplegable dentro de la caja de `Menu`, y el del selector de fecha— y un
selector estructural que acertara con las cinco sería más frágil que un
contexto.

**El marcador es un EJEMPLO, no una regla.** «dd/mm/aaaa» sí; «Opcional»
no: que un campo no sea obligatorio ya se sabe porque el formulario se
envía sin él.

### Los iconos de un campo

| Sitio | Qué es | Cuántos |
|---|---|---|
| Izquierda (`icono`) | **Informativo.** De qué es el campo. No se pulsa | Uno |
| Derecha (`acciones`) | **Activas.** Borrar lo escrito, ver la contraseña | Hasta dos |

`acciones` es una lista y no un `ReactNode` suelto porque el campo necesita
saber cuántas son para reservarles sitio con su relleno derecho, y contar
los hijos de un fragmento no se puede hacer de forma fiable.

Un icono a la izquierda corre la etiqueta flotante para que no le caiga
encima; lo dice con `data-icono`, que lee `.campo`.

**El selector de fecha es la excepción:** su calendario va a la DERECHA y no
lleva flecha. El calendario no es informativo —no hace falta un dibujo para
saber que «4 de abril de 2022» es una fecha—: es la señal de que esto abre
un calendario, que es exactamente el papel de la flecha de un desplegable.
Con las dos había dos iconos diciendo lo mismo, uno a cada lado del valor.

`components/ui/campo.test.tsx` comprueba los ganchos que el CSS necesita
—el orden de los hermanos, el marcador que siempre está, los `data-` de un
desplegable— y falla si una pantalla vuelve a escribir un `<Label>` suelto.

## 14. Un aviso flotante dice su severidad de tres maneras

`mostrarAviso(titular, { detalle, tono })`. Dos líneas: el titular dice QUÉ
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

Un movimiento no es una cosa con nombre propio: es la anotación de que tal
día salió tal plata de tal concepto.

**Su nombre lo TOMA del concepto** al que pertenece, y se deriva —nunca se
guarda una copia—. Si se guardara, renombrar un concepto dejaría atrás a sus
movimientos: «Aseo» pasaría a llamarse «Aseo y limpieza» en Centros de
costos y en la tabla seguirían los cuarenta viejos diciendo «Aseo». Dos
nombres para lo mismo y ninguna forma de saber cuál es el bueno.

Está en `nombreDelMovimiento()` (`lib/movimientos.ts`), con sus dos
respaldos: si solo está clasificado hasta el grupo, el nombre del grupo; y
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

**Conceptos, grupos y centros solo se editan y se eliminan desde Centros de
costos.** Desde la tabla de movimientos y desde la ficha de un movimiento se
anota y se corrige lo que PASÓ; no se rehace el mapa con el que se ordena.
Por eso el `Combo` de un concepto ofrece crear lo que falta pero nunca
renombrar ni borrar, y por eso el de centro de costos no ofrece ni crear.

Y allí los tres niveles se editan y se borran igual: `CategoriaModal` para
renombrar —y para lo estático, que solo existe en un centro— y
`ConfirmarBorrado` para quitar.

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
  así que borrar un grupo dejaba a sus conceptos con el padre en nulo y los
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

Lo pendiente —un movimiento sin clasificar— va en el verde medio del tema
(`warning`). El rojo se reserva a lo que de verdad salió mal y a lo que no
se puede deshacer.

La paleta es de cuatro verdes y no tiene un cálido: verde británico, lima,
turquesa y verde medio. Eso deja lo pendiente a 16° de matiz de lo que
entra, así que donde los dos puedan convivir —una fila vencida en una tabla
con ingresos— la señal no puede ser solo el color: la palabra, el signo o
el peso de la letra tienen que decirlo también.

## 17. Componentes, no copias

Si algo aparece en dos pantallas, es un componente. Lo son la tabla de
movimientos, el paginador, la barra de filtros, el calendario, la dona, la
cabecera de una pantalla (`components/cabecera-de-pagina.tsx`), la cabecera
y el pie de una ficha (`components/ui/modal-partes.tsx`), el campo de un
formulario con su etiqueta flotante (`components/ui/campo.tsx`), el bloque
dentro de una tarjeta (`components/ui/bloque.tsx`) y la barra de progreso
(`components/ui/progreso.tsx`).

Lo que no puede ser un componente —porque hace falta un `<label>` o un
`<button>` en vez de un `<div>`— exporta su CLASE, como hacen `BLOQUE` y
`SUPERFICIE_FLOTANTE`. Sigue siendo un solo sitio donde cambia el aspecto.

Dos copias empiezan iguales y se separan: una aprende a marcar lo que
falta por clasificar y la otra no, y la misma plata acaba viéndose
distinta según por dónde se entre.

## 18. El foco se pinta cuando se pide

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

**Dónde vive.** `FOCO_DEL_CAMPO`, en `components/ui/campo.tsx`, y lo usan el
`Input`, el `Textarea` y `disparadorDeCampo()`. Es el borde del anillo al
60 % y un halo al 20 %: **un solo píxel de trazo**, el mismo que el campo ya
tenía en reposo, cambiando de color y no de grosor. Estuvo a plena tinta
—borde y anillo, dos píxeles de verde saturado— y con cuatro campos en una
ficha el enfocado no se leía como enfocado sino como marcado.

Lo que es error va a plena tinta: es la excepción, y tiene que verse desde
el otro lado de la ficha.

**Lo que la regla NO dice es dónde está el cursor.** Son dos cosas, y se
escriben distinto. Es justo lo que se había perdido en la etiqueta flotante:

| Qué | Selector | Por qué |
|---|---|---|
| **Subir** la etiqueta | `:focus-within` | Es estructural: si no sube, lo que se escribe se pisa con el nombre del campo |
| **Teñirla** | `:focus-visible` | Eso ya es la señal |

Con las dos en `:focus-within` se contradecían en el caso más corriente de
todos: al pulsar un desplegable con el ratón, un `<button>` no coincide con
`:focus-visible` —los navegadores lo reservan al teclado—, así que la caja
no pintaba su anillo y la etiqueta sí se ponía verde.

**Y una superficie con velo mete el foco en su CAJA**, no en su primer
control (`lib/foco.ts`). Tiene que entrar —si se queda detrás del velo, el
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

`lib/foco.test.ts` lee el código fuente y falla si aparece un `autoFocus`
fuera de esa lista, si alguien mueve el foco a mano al abrir algo, si la
señal se escribe con `focus:`, si un botón vuelve a dibujar un anillo, o si
desaparece la línea que los exime del contorno.
