import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * El título de una pantalla, su línea de explicación y lo que se puede hacer.
 *
 * ── Por qué es un componente ────────────────────────────────────────────────
 * Porque ocho pantallas lo escribían a mano y ya se habían separado en TRES
 * tipografías distintas: el resumen y los movimientos en `text-2xl sm:text-3xl`
 * con la familia de titulares, cinco pantallas en `text-3xl` plano con la
 * familia del cuerpo, y los centros de costos en `text-3xl sm:text-4xl`. Nadie
 * lo decidió; se escribió ocho veces y salieron tres.
 *
 * Y se nota al navegar, que es lo peor: el título cambia de tamaño al pasar de
 * una pantalla a otra, así que la aplicación parece tres aplicaciones.
 *
 * ── Por qué crece con la pantalla ───────────────────────────────────────────
 * 24px en un teléfono y 30 a partir de una tableta. Con 30 fijos, "Importar
 * movimientos" ocupaba dos renglones en un teléfono y empujaba el contenido
 * por debajo del pliegue.
 *
 * ── Por qué no lleva interletraje ───────────────────────────────────────────
 * El tema lo declara en cero y Geist ya viene cerrada de por sí; el
 * `tracking-tight` que arrastraban tres de las ocho compensaba una familia más
 * suelta, y aplicado a esta apiña los títulos.
 *
 * ── Por qué la raya es del componente ───────────────────────────────────────
 * Porque la llevaban DOS de las ocho pantallas —las que pasan por la barra de
 * filtros, que la escribía en su propia llamada— y las otras seis no. Al
 * navegar, el título ganaba y perdía una línea debajo según por dónde se
 * entrara. La raya separa el título del contenido, y eso hace falta en las
 * ocho o en ninguna.
 *
 * ── Y la acción va en `sm` ──────────────────────────────────────────────────
 * Los 36px, no los 44. No es una preferencia: en la barra de filtros la acción
 * principal convive con la búsqueda, el orden, el filtro y el rango, y ahí ya
 * está decidido que todos los controles de la fila midan lo mismo —romperlo
 * dejaba la fila descuadrada, y está escrito en su código—. Si el botón de
 * Centros de costos mide 44 y el del resumen 36, la misma acción cambia de
 * tamaño al cambiar de pantalla.
 */
/**
 * La tipografía de un título de pantalla, para lo que no es una cabecera.
 *
 * La usa el 404, que no tiene ayuda ni acciones ni contenido que separar: es un
 * título centrado en una pantalla vacía. Se escribía a mano —`text-3xl` plano,
 * sin la familia de titulares y sin crecer con la pantalla— y era la novena
 * pantalla con su propia tipografía de título justo después de unificar las
 * ocho primeras.
 */
export const PAGE_TITLE = 'font-display text-2xl font-semibold leading-tight sm:text-3xl';

export function PageHeader({
  title,
  description,
  beside,
  actions,
  align = 'top',
  className,
}: {
  title: string;
  /** Qué es esta pantalla, o qué se está viendo. Una línea. */
  description?: ReactNode;
  /** Va pegado al título: un botón de ayuda, una etiqueta de estado. */
  beside?: ReactNode;
  /** Lo que se puede hacer aquí, al extremo opuesto del título. */
  actions?: ReactNode;
  /**
   * `abajo` alinea las acciones con la línea de base del título en vez de con
   * su parte de arriba. Es lo que quiere una barra de filtros, donde lo de la
   * derecha son controles del mismo alto y no un botón suelto.
   */
  align?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap justify-between gap-x-4 gap-y-3',
        align === 'bottom' ? 'items-end' : 'items-start',
        'border-b border-border pb-4',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className={PAGE_TITLE}>{title}</h1>
          {beside}
        </div>
        {Boolean(description) && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {actions}
    </header>
  );
}
