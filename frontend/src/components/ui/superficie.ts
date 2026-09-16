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
