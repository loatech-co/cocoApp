/**
 * La superficie de todo lo que FLOTA sobre la página.
 *
 * Un desplegable, un calendario, un modal, una confirmación, la pista de una
 * gráfica y el aviso de una esquina son cosas distintas con un mismo trabajo:
 * levantarse del plano y decir "esto está encima". Eso son tres decisiones
 * —color, sombra y línea— y estaban escritas diez veces.
 *
 * ── Por qué la LÍNEA no puede faltar ────────────────────────────────────────
 * Porque la sombra sola no delimita en ningún tema: en claro el popover es
 * blanco sobre un lienzo casi blanco, y en oscuro la sombra es negra sobre un
 * fondo casi negro. Lo que dibuja el canto es la línea.
 *
 * ── Por qué es el borde del TEMA y no un negro al 5 % ───────────────────────
 * Era `ring-black/5` con `dark:ring-white/12`: dos valores inventados que no
 * salen de ningún token. Sobre #ffffff, un negro al 5 % da #f2f2f2 —dos puntos
 * de diferencia con el lienzo—, así que el panel no tenía canto. `--border`
 * está calculado por el tema justamente para verse contra sus superficies, en
 * los dos modos, y cambia con él.
 *
 * Es un ANILLO y no un borde a propósito: el anillo no ocupa sitio, así que
 * ponerlo no corre ni un píxel el contenido de los diez sitios que lo llevan.
 */
export const SUPERFICIE_FLOTANTE =
  'bg-popover text-popover-foreground shadow-[var(--sombra-flotante)] ring-1 ring-border';

/**
 * Lo que aparece de golpe se lee como un fallo de pintado.
 *
 * 120ms y un 4 % de escala: suficiente para que el ojo entienda que el panel
 * SALE del botón que lo abrió, y demasiado poco para que nadie espere. La
 * animación está en `index.css` —con su excepción para quien pide menos
 * movimiento— y aquí solo se nombra.
 */
export const SURGE = 'surge';

/**
 * El realce de LO QUE RESPONDE al cursor: una opción, una fila, un día del
 * calendario, una baldosa.
 *
 * ── Por qué el acento como TINTA y no como superficie ───────────────────────
 * Era `bg-accent`, que en este tema es un verde esmeralda apagado. Funciona
 * —se ve que algo cambió— pero no se parece a nada: el color con el que esta
 * app dice «esto» es el lima, y estaba reservado a lo elegido. Así que al
 * pasar por encima había un verde y al elegir, otro, sin que la relación
 * entre los dos significara nada.
 *
 * Ahora es el mismo lima en los dos, a dos intensidades: al 10 % tiñe el
 * fondo mientras el cursor está encima, y lo elegido se queda con su fondo
 * quieto. La diferencia entre «estoy señalando esto» y «esto es lo que hay»
 * pasa a ser de grado y no de color, que es lo que son.
 *
 * `--acento-tinta` y no `--primary`: es el mismo color en oscuro, pero en
 * claro el primario es un verde casi negro y esto tiene que servir de TINTA
 * sobre una superficie clara.
 */
export const REALCE = 'hover:bg-acento-tinta/10 hover:text-acento-tinta';

/**
 * El realce de una superficie GRANDE que responde al cursor.
 *
 * ── Por qué no es el mismo que el de una opción ─────────────────────────────
 * Lo que responde se marca con `accent`, y en una opción de menú o en una fila
 * de una lista eso es exactamente lo que hace falta: la franja se enciende y
 * se apaga al pasar. Pero en una superficie de mil por doscientos cincuenta
 * —la zona donde se sueltan los soportes, el hueco donde va el próximo grupo—
 * ese mismo relleno a plena intensidad es un fogonazo, no una respuesta.
 *
 * Así que el acento baja a un tercio y la letra sube a plena tinta. Sigue
 * siendo el mismo lenguaje —responde con `accent`, como todo lo demás— a un
 * volumen proporcional al sitio que ocupa.
 *
 * ── Y no toca el trazo ──────────────────────────────────────────────────────
 * Estas superficies llevan borde punteado. Cambiarle el color redibuja el
 * contorno entero de golpe, y en un rectángulo de ese tamaño eso se lee como
 * movimiento y no como respuesta. El trazo se reserva para cuando hay un
 * archivo encima: ahí sí hay algo que decir —«esto es lo que lo va a
 * recibir»— y el cambio de color lo dice de una vez.
 */
export const REALCE_DE_SUPERFICIE = 'hover:bg-accent/30 hover:text-foreground';
