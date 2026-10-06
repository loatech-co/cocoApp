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
const SLOT =
  'flex h-15 min-w-0 flex-1 items-center justify-center transition-colors duration-[120ms]';

const ink = (isOn: boolean) => (isOn ? 'text-sidebar-active' : 'text-sidebar-muted');

type BarIconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean;
  fill?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}>;

/** El icono de un hueco: relleno al 18 % de su propio color, trazo 1,75. */
export function BarIcon({ Icon }: { Icon: BarIconComponent }) {
  return (
    <Icon
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
  isExact,
  label,
  Icon,
}: {
  to: string;
  isExact: boolean;
  label: string;
  Icon: BarIconComponent;
}) {
  return (
    <NavLink
      to={to}
      end={isExact}
      aria-label={label}
      className={({ isActive }) => cn(SLOT, ink(isActive))}
    >
      <BarIcon Icon={Icon} />
    </NavLink>
  );
}

/** Un hueco que no lleva a ninguna parte: abre algo sobre la página. */
export function BarSlotButton({
  label,
  isOn,
  onClick,
  children,
}: {
  label: string;
  isOn: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={isOn}
      className={cn(SLOT, ink(isOn))}
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
export function BarFab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
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
