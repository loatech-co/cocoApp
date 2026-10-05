import { createContext, use } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * «Estás dentro de un campo con etiqueta flotante».
 *
 * ── Por qué un contexto y no una propiedad ──────────────────────────────────
 * Porque lo único que cambia es el RELLENO DE ARRIBA del control, para dejarle
 * sitio a la etiqueta subida, y eso lo tienen que saber cinco componentes con
 * cinco estructuras distintas: un `<input>` suelto, un `<input>` con iconos
 * colocados en absoluto, un `<textarea>`, el disparador de un desplegable
 * —que lo pinta `Menu`, dos niveles más abajo— y el del selector de fecha.
 *
 * Pasarlo como propiedad obligaría a cada una de las nueve llamadas a
 * escribirlo, y a `Menu` a reenviarlo a un botón que no es suyo. Con un
 * contexto, ninguna llamada cambia y cada control lo lee donde le sirve.
 *
 * Y no es estado: es «dónde estoy». Un contexto sin valor que cambie no
 * provoca ni un renderizado de más.
 */
export const DentroDeUnCampo = createContext(false);

/** `true` si este control vive dentro de un `Campo`. */
export function useDentroDeUnCampo(): boolean {
  return use(DentroDeUnCampo);
}

/**
 * El hueco que reserva arriba un control con etiqueta flotante.
 *
 * 20px arriba y 4 abajo en un campo de 44: la etiqueta subida ocupa de 7 a 18,
 * y el valor queda centrado en la mitad de abajo. Vive aquí, junto al
 * contexto, porque los cinco controles tienen que reservar exactamente el
 * mismo: con dos valores distintos, dos campos de la misma fila alinean su
 * texto a alturas distintas.
 */
export const HUECO_DE_LA_ETIQUETA = 'pb-1 pt-5';

/**
 * Cómo se ve un campo que tiene el foco.
 *
 * ── Fino y translúcido ──────────────────────────────────────────────────────
 * Era el borde a plena tinta del anillo MÁS un anillo de 1px, también a plena
 * tinta: dos píxeles de verde saturado alrededor de la caja. Con cuatro campos
 * en una ficha, el que estaba enfocado no se leía como enfocado sino como
 * seleccionado, o como marcado en rojo pero en verde.
 *
 * Ahora es un solo trazo: el borde teñido al 60 % —un píxel, el mismo que
 * tenía en reposo, cambiando de color y no de grosor— y el anillo bajado al
 * 20 %, que ya no es un canto sino el halo que lo despega de lo que tiene
 * detrás. Sigue siendo el primer sitio donde va el ojo al mirar la ficha, que
 * es todo lo que tiene que hacer.
 *
 * ── Y solo con `:focus-visible` ─────────────────────────────────────────────
 * Nunca con `:focus`. La diferencia es justo la regla: `:focus` se enciende
 * también cuando el foco lo pone el programa —al abrir una ficha, al cerrar un
 * desplegable que lo devuelve a su botón— y entonces hay un campo encendido
 * que nadie eligió.
 *
 * El error es la excepción y va a plena tinta: un campo mal rellenado tiene
 * que verse desde el otro lado de la ficha.
 */
export const FOCO_DEL_CAMPO =
  'outline-none focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-ring/20';

/**
 * El aspecto de un campo que se DESPLIEGA: un `Select`, un `Combo`, un
 * selector de fecha.
 *
 * Los tres lo escribían a mano y ya se habían separado —uno tenía
 * `aria-expanded:border-ring` y los otros no—. Son el mismo objeto: una caja
 * con el borde de un campo, que se tiñe al pasar por encima y se enciende al
 * recibir el foco, con su valor a la izquierda y lo que abre a la derecha.
 *
 * El borde es el de los CAMPOS —`--input`— y no el de los contenedores: un
 * desplegable se rellena, y tiene que pesar igual que el campo de texto que
 * lleva al lado en la misma fila.
 */
export function disparadorDeCampo(pequeno = false): string {
  return cn(
    'flex w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card text-left',
    'transition-colors hover:border-ring/40',
    FOCO_DEL_CAMPO,
    'aria-expanded:border-ring',
    // El suelo táctil: apagado y encendido miden lo mismo, o la fila salta al
    // deshabilitarse.
    'movil:min-h-[42px]',
    // El relleno de la derecha es igual al de la izquierda porque lo que abre
    // ya está dentro del flex: no hay nada que esquivar.
    pequeno ? 'h-9 px-3 text-xs' : 'h-11 px-3 text-sm',
  );
}
