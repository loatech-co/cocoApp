import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * La cabecera y el pie de una ficha.
 *
 * ── Por qué están fuera de `Modal` ──────────────────────────────────────────
 * Porque hay DOS armazones. `ui/modal.tsx` sirve para las fichas que caben en
 * su forma —un título, una línea de ayuda, una equis— y la del movimiento
 * tiene el suyo, porque lleva un pastel de color delante del título y un ancho
 * distinto. Escritas dentro de `Modal`, la del movimiento no podía usarlas y
 * se copiaban; sueltas, las usan las dos.
 *
 * Y el pie estaba escrito TRES veces —centro de costos, concepto y
 * movimiento—, las tres con `flex-1` en los dos botones. En una ficha estrecha
 * eso se ve bien; en la del movimiento, que llega a 1024px, cada botón se
 * comía media pantalla y «Cancelar» pesaba exactamente lo mismo que
 * «Registrar».
 */

/**
 * El panel de una ficha: la caja blanca que flota sobre el velo.
 *
 * ── Por qué es una clase y no un componente ─────────────────────────────────
 * Porque los dos armazones ponen cosas distintas dentro —la del movimiento
 * lleva pasos, cámara y lectura— y lo que comparten es la CAJA: una columna
 * con un alto máximo y uno mínimo. Exportar la clase es el mismo recurso que
 * `BLOQUE` y `SUPERFICIE_FLOTANTE`: un solo sitio donde cambia la medida.
 *
 * ── El alto mínimo: 600px ───────────────────────────────────────────────────
 * Sin él, una ficha mide lo que mida su formulario, y eso hace que la misma
 * ventana sea tres ventanas: «Nuevo grupo» salía de 260px, «Nuevo concepto»
 * de 420 y la del movimiento de 700. Abrir dos seguidas era ver el panel
 * crecer y encogerse en el mismo sitio de la pantalla, y en la corta los
 * botones quedaban a media altura, donde no los busca nadie.
 *
 * ── Por qué `min(600px, 92dvh)` y no 600px a secas ──────────────────────────
 * Porque en CSS el alto mínimo GANA al máximo: en una pantalla baja —un
 * teléfono pequeño, una ventana a media altura— un `min-h` de 600 se comería
 * el `max-h` de 92dvh y la ficha se saldría por abajo, con sus botones fuera.
 * Con `min()` el mínimo nunca puede pasarse del máximo.
 */
export const PANEL_DE_MODAL =
  'flex max-h-[92dvh] min-h-[min(600px,92dvh)] w-full flex-col';

/**
 * La cabecera de una ficha.
 *
 * ── Por qué no se desplaza ──────────────────────────────────────────────────
 * Lo pone quien la coloca —con `shrink-0` dentro de una columna—, y hace falta:
 * en una ficha larga el título y la equis se iban por arriba, y a mitad de un
 * formulario no quedaba en pantalla ni qué se estaba editando ni por dónde
 * salir.
 *
 * ── Por qué la equis va junto a las demás acciones ──────────────────────────
 * Porque eliminar, editar y cerrar son las tres cosas que se pueden hacer con
 * la ficha ENTERA, frente a las que se hacen con lo que tiene dentro.
 * Repartidas en dos esquinas hay que buscarlas por separado.
 */
export function CabeceraDeModal({
  titulo,
  ayuda,
  antes,
  acciones,
  onCerrar,
  className,
}: {
  titulo: ReactNode;
  /** Qué es esta ficha, en una frase. */
  ayuda?: string;
  /** Va delante del título: el pastel de color de un movimiento. */
  antes?: ReactNode;
  /** Botones de icono a la izquierda de la equis. Eliminar, editar. */
  acciones?: ReactNode;
  onCerrar: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6 sm:pt-6',
        className,
      )}
    >
      {/*
        La fila interior va centrada y la exterior arranca arriba, y no es lo
        mismo: el pastel tiene que quedar a la altura del título —no de su
        línea de ayuda—, y la equis tiene que quedarse arriba aunque debajo
        haya dos renglones de explicación.
      */}
      <div className="flex min-w-0 items-center gap-3">
        {antes}
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold leading-tight">{titulo}</h2>
          {ayuda && <p className="mt-1 text-sm text-muted-foreground">{ayuda}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {acciones}
        <Button type="button" variant="ghost" size="sm-icon" onClick={onCerrar} aria-label="Cerrar">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/**
 * El pie de una ficha: lo que cierra y lo que confirma.
 *
 * ── Por qué los botones NO se estiran ───────────────────────────────────────
 * Los tres pies que había llevaban `flex-1` en los dos botones, así que se
 * repartían el ancho a medias. En una ficha estrecha pasa desapercibido; en
 * la del movimiento, que llega a 1024px, cada botón medía 480px y «Cancelar»
 * pesaba exactamente lo mismo que «Registrar». Un botón del tamaño de su
 * texto dice cuál es la acción principal sin tener que gritarlo.
 *
 * ── Por qué a la derecha ────────────────────────────────────────────────────
 * Es donde termina de leerse un formulario: se recorre de arriba abajo y de
 * izquierda a derecha, y la acción que lo cierra va donde acaba el recorrido.
 *
 * ── Por qué en el teléfono se apilan a ancho completo ───────────────────────
 * Porque dos botones del tamaño de su texto, en una esquina, son dos blancos
 * pequeños y juntos: es donde se pulsa «Cancelar» queriendo pulsar «Guardar».
 * Apilados y a todo el ancho no hay forma de equivocarse.
 *
 * Y se apilan en el ORDEN en que están escritos, sin invertirlo: en el
 * teléfono esta ficha está pegada al pie de la pantalla, así que lo de más
 * abajo es lo que queda más cerca del pulgar, y ahí tiene que estar la acción
 * principal. Invertirlo —como hace la convención de escritorio, que sube el
 * botón primario— la alejaría justo en la pantalla donde más cuesta llegar.
 *
 * ── Por qué `mt-auto` ───────────────────────────────────────────────────────
 * Desde que el panel tiene alto mínimo, en un formulario corto sobra sitio
 * debajo. Sin esto los botones se quedaban pegados al último campo, a media
 * altura, con un palmo de vacío debajo: parecía una ficha a medio cargar. El
 * margen automático los manda al fondo, que es donde termina de leerse.
 *
 * Solo hace algo dentro de una columna flexible con sitio de sobra. En la
 * confirmación, que no lo es, no estorba: ahí manda el `mt-6` de la llamada.
 */
export function PieDeModal({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-auto flex flex-col gap-2 pt-2',
        'sm:flex-row sm:justify-end',
        // A ancho completo apilados, al tamaño de su texto en una fila.
        '[&>*]:w-full sm:[&>*]:w-auto',
        className,
      )}
      {...props}
    />
  );
}
