import { Plus } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/shared/lib/utils';

/**
 * Los huecos de la barra de abajo del teléfono.
 *
 * Todos miden lo mismo —60 de alto y un reparto igual del ancho— y llevan el
 * mismo par de colores, lleven a otra pantalla o abran algo encima: quien
 * mira la barra no tiene por qué saber cuál de los cinco cambia de pantalla y
 * cuál levanta una hoja. Lo que los distingue es lo que pasa al tocarlos.
 */
const HUECO =
  'flex h-15 min-w-0 flex-1 items-center justify-center transition-colors duration-[120ms]';

const tinta = (encendido: boolean) => (encendido ? 'text-sidebar-active' : 'text-sidebar-muted');

type IconoDeBarra = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean;
  fill?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}>;

/** El icono de un hueco: relleno al 18 % de su propio color, trazo 1,75. */
export function BarIcon({ Icono }: { Icono: IconoDeBarra }) {
  return (
    <Icono
      className="size-6"
      fill="currentColor"
      fillOpacity={0.18}
      strokeWidth={1.75}
      aria-hidden={true}
    />
  );
}

/** Un hueco que lleva a una sección. */
export function BarSlotLink({
  to,
  exact,
  etiqueta,
  Icono,
}: {
  to: string;
  exact: boolean;
  etiqueta: string;
  Icono: IconoDeBarra;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      aria-label={etiqueta}
      className={({ isActive }) => cn(HUECO, tinta(isActive))}
    >
      <BarIcon Icono={Icono} />
    </NavLink>
  );
}

/** Un hueco que no lleva a ninguna parte: abre algo sobre la página. */
export function BarSlotButton({
  etiqueta,
  encendido,
  onClick,
  children,
}: {
  etiqueta: string;
  encendido: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      aria-expanded={encendido}
      className={cn(HUECO, tinta(encendido))}
    >
      {children}
    </button>
  );
}

/**
 * La acción de la barra: registrar un gasto.
 *
 * Redonda, no baldosa con esquinas: una baldosa se leería como una más de las
 * que abre, y el único control de la barra que no es un destino no debería
 * parecer uno de ellos. Sube 16 por encima de la raya, y quedan 20 de barra
 * por debajo. Al pulsarla baja 2, como una tecla.
 */
export function BarFab({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className={cn(
        'grid size-14 place-items-center rounded-full',
        '-mt-4',
        'bg-sidebar-active text-sidebar-active-foreground shadow-[var(--sombra-flotante)]',
        'transition-transform duration-[120ms] active:translate-y-0.5',
      )}
    >
      <Plus className="size-6" strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
