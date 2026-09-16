import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

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
 */
export function CabeceraDePagina({
  titulo,
  ayuda,
  junto,
  acciones,
  alineado = 'arriba',
  className,
}: {
  titulo: string;
  /** Qué es esta pantalla, o qué se está viendo. Una línea. */
  ayuda?: ReactNode;
  /** Va pegado al título: un botón de ayuda, una etiqueta de estado. */
  junto?: ReactNode;
  /** Lo que se puede hacer aquí, al extremo opuesto del título. */
  acciones?: ReactNode;
  /**
   * `abajo` alinea las acciones con la línea de base del título en vez de con
   * su parte de arriba. Es lo que quiere una barra de filtros, donde lo de la
   * derecha son controles del mismo alto y no un botón suelto.
   */
  alineado?: 'arriba' | 'abajo';
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap justify-between gap-x-4 gap-y-3',
        alineado === 'abajo' ? 'items-end' : 'items-start',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
            {titulo}
          </h1>
          {junto}
        </div>
        {ayuda && <p className="mt-1 text-sm text-muted-foreground">{ayuda}</p>}
      </div>

      {acciones}
    </header>
  );
}
