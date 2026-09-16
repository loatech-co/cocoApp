import { useEffect, type ReactNode } from 'react';

import { CabeceraDeModal, PANEL_DE_MODAL } from '@/components/ui/modal-partes';
import { SUPERFICIE_FLOTANTE } from '@/components/ui/superficie';
import { cn } from '@/lib/utils';

/**
 * El armazón de una ficha: el velo, el panel y su cabecera.
 *
 * ── Por qué es un componente y no se copia ──────────────────────────────────
 * Porque el modal no es un rectángulo: es un velo que cierra al tocarlo, una
 * tecla de escape, un panel que se desliza desde abajo en un teléfono y se
 * centra en un escritorio, un alto máximo con desplazamiento dentro y una
 * equis en su esquina. Son seis decisiones, y copiadas empiezan iguales y se
 * separan: una aprende a cerrar con Escape y la otra no, y la misma app se
 * comporta distinto según por dónde se entre.
 *
 * ── Por qué se pega abajo en el teléfono ────────────────────────────────────
 * Porque ahí es donde llega el pulgar. Un panel centrado con los botones a
 * media pantalla obliga a cambiar de mano para guardar.
 *
 * ── Por qué NO enfoca su primer campo ───────────────────────────────────────
 * Porque abrir una ficha no es empezar a escribir en ella. El primer campo
 * enfocado y resaltado dice «escribe aquí» cuando lo que uno viene a hacer casi
 * siempre es LEER lo que hay —de qué movimiento se trata, qué valor tiene— y
 * corregir un campo concreto, que rara vez es el primero. Y con la etiqueta
 * flotante es peor: el campo enfocado sube su etiqueta y enseña su marcador,
 * así que un formulario vacío parece uno a medio llenar.
 *
 * Donde SÍ se enfoca es en un campo que aparece porque alguien lo pidió: la
 * búsqueda que sale al pulsar la lupa, el «Agregar concepto» que sale al pulsar
 * su botón. Ahí el foco no es un añadido, es la segunda mitad de ese clic; sin
 * él habría que pulsar y luego apuntar al campo que acaba de aparecer.
 *
 * La confirmación es el otro caso aparte, y enfoca CANCELAR a propósito: quien
 * llega con Enter puesto no quiso borrar nada, venía de pulsar otra cosa.
 *
 * ── Por qué la cabecera NO se desplaza ──────────────────────────────────────
 * El desplazamiento estaba en el panel entero, así que en una ficha larga el
 * título y la equis se iban por arriba: a mitad de un formulario no quedaba
 * en pantalla ni qué se estaba editando ni por dónde salir, y la única forma
 * de cerrar era subir otra vez. Ahora el panel es una columna con dos partes:
 * la cabecera, que se queda, y el cuerpo, que es lo que se recorre.
 */
export function Modal({
  abierta,
  titulo,
  ayuda,
  acciones,
  ancho = 'sm:max-w-xl',
  onCerrar,
  children,
}: {
  abierta: boolean;
  titulo: string;
  /** La línea bajo el título: qué es esto, en una frase. */
  ayuda?: string;
  /** Botones de icono a la izquierda de la equis. Por ejemplo, eliminar. */
  acciones?: ReactNode;
  ancho?: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  // Escape cierra. Un panel que solo se cierra con su propio botón obliga a
  // apuntar con el ratón para deshacer lo que se abrió sin querer.
  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      // `onMouseDown` y no `onClick`: con clic, arrastrar el ratón desde
      // dentro del panel hasta el velo —seleccionando un texto, por ejemplo—
      // cerraba la ficha con todo lo escrito dentro.
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      // La marca por la que preguntan las superficies de debajo. Una trampa de
      // foco se aparta mientras hay una ficha abierta, y Escape cierra primero
      // la ficha: dos trampas peleándose por el tabulador son un teclado que no
      // hace nada.
      data-modal=""
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-[var(--velo)] p-0 backdrop-blur-sm',
        'se-revela sm:items-center sm:p-4',
      )}
    >
      <div
        className={cn(
          PANEL_DE_MODAL,
          SUPERFICIE_FLOTANTE,
          'emerge',
          // Pegado abajo se redondea solo arriba: las esquinas de abajo caen
          // fuera de la pantalla y curvarlas deja dos muescas del fondo.
          'rounded-t-lg sm:rounded-lg',
          ancho,
        )}
      >
        <CabeceraDeModal titulo={titulo} ayuda={ayuda} acciones={acciones} onCerrar={onCerrar} />

        {/*
          `min-h-0` es lo que permite que esto se encoja: sin él, un hijo de
          una columna flexible mide lo que mide su contenido y se lleva por
          delante el alto máximo del panel —es el mismo motivo por el que la
          fila del resumen se desbordaba sobre la tabla—.

          Y el relleno de abajo reserva el borde seguro del teléfono: pegada al
          pie, la última fila de la ficha caía debajo de la barra del sistema.

          Es una COLUMNA porque el panel tiene alto mínimo: con un formulario
          corto sobra sitio, y hace falta que el formulario pueda estirarse
          para llevarse sus botones al fondo. En una caja de bloque no habría
          sitio que repartir y el pie se quedaría a media altura.
        */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </div>
      </div>
    </div>
  );
}
