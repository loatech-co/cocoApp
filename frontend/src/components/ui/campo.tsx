import { createContext, useContext, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

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
const DentroDeUnCampo = createContext(false);

/** `true` si este control vive dentro de un `Campo`. */
export function useDentroDeUnCampo(): boolean {
  return useContext(DentroDeUnCampo);
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
    'outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
    'aria-expanded:border-ring',
    // El suelo táctil: apagado y encendido miden lo mismo, o la fila salta al
    // deshabilitarse.
    'movil:min-h-[42px]',
    // El relleno de la derecha es igual al de la izquierda porque lo que abre
    // ya está dentro del flex: no hay nada que esquivar.
    pequeno ? 'h-9 px-3 text-xs' : 'h-11 px-3 text-sm',
  );
}

/**
 * Un campo de formulario: su nombre DENTRO del control, y el control.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────────
 * La etiqueta empieza donde estaría el marcador. Al enfocar el campo se
 * encoge y se sube a la parte de arriba del propio campo, dejando su sitio al
 * marcador —que es el ejemplo, no el nombre—. Al escribir, el marcador
 * desaparece y queda lo escrito. Al soltar el campo, la etiqueta se queda
 * arriba si hay algo y baja si no.
 *
 * La máquina de estados está en `index.css`, bajo `.campo`, y no aquí: son
 * cuatro disparadores distintos que significan lo mismo y ninguno lo sabe este
 * componente. El porqué está escrito allí.
 *
 * ── Por qué el nombre va dentro y no encima ─────────────────────────────────
 * Antes iba encima, con este argumento: un marcador desaparece al escribir, así
 * que al revisar un formulario ya lleno nadie sabe qué era cada caja. El
 * argumento sigue en pie y por eso la etiqueta NO es un marcador: cuando hay
 * algo escrito no se va, se queda pequeña sobre el borde. Lo que se gana es el
 * renglón que ocupaba encima de cada campo —seis campos son seis renglones— y
 * que el nombre y el valor se lean como una sola cosa en vez de dos.
 *
 * ── Por qué el `id` es obligatorio ──────────────────────────────────────────
 * Es lo único que ata la etiqueta al control para quien navega con lector de
 * pantalla. Una etiqueta flotante que no está asociada es decoración: se ve el
 * nombre y no se oye.
 */
export function Campo({
  etiqueta,
  id,
  ayuda,
  className,
  children,
}: {
  etiqueta: string;
  /** El mismo `id` que lleva el control: es lo que los ata. */
  id: string;
  /** Una línea debajo, para lo que el nombre no alcanza a decir. */
  ayuda?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/*
        El control va PRIMERO y la etiqueta después, aunque se vea al
        contrario: la etiqueta está colocada en absoluto encima de él, y
        ponerla antes en el marcado obligaría a que el control fuera el
        hermano siguiente, que es justo lo que los selectores de `.campo` no
        necesitan saber.
      */}
      <div className="campo">
        <DentroDeUnCampo.Provider value={true}>{children}</DentroDeUnCampo.Provider>
        <label htmlFor={id}>{etiqueta}</label>
      </div>

      {ayuda && <p className="text-xs leading-relaxed text-muted-foreground">{ayuda}</p>}
    </div>
  );
}
