import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
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
          'flex max-h-[92dvh] w-full flex-col',
          SUPERFICIE_FLOTANTE,
          'emerge',
          // Pegado abajo se redondea solo arriba: las esquinas de abajo caen
          // fuera de la pantalla y curvarlas deja dos muescas del fondo.
          'rounded-t-lg sm:rounded-lg',
          ancho,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold leading-tight">{titulo}</h2>
            {ayuda && <p className="mt-1 text-sm text-muted-foreground">{ayuda}</p>}
          </div>

          {/* Juntas y del mismo tamaño: son las acciones de la ficha que no
              son "guardar", y repartidas en dos sitios hay que buscarlas por
              separado. */}
          <div className="flex shrink-0 items-center gap-1">
            {acciones}
            <Button
              type="button"
              variant="ghost"
              size="sm-icon"
              onClick={onCerrar}
              aria-label="Cerrar"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/*
          `min-h-0` es lo que permite que esto se encoja: sin él, un hijo de
          una columna flexible mide lo que mide su contenido y se lleva por
          delante el alto máximo del panel —es el mismo motivo por el que la
          fila del resumen se desbordaba sobre la tabla—.

          Y el relleno de abajo reserva el borde seguro del teléfono: pegada al
          pie, la última fila de la ficha caía debajo de la barra del sistema.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
