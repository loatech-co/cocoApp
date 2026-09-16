import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ROL = { menu: 'menu', panel: 'dialog', lista: 'listbox' } as const;
const ARIA = { menu: 'menu', panel: 'dialog', lista: 'listbox' } as const;

/**
 * Un desplegable.
 *
 * ── Por qué es un componente y no tres ──────────────────────────────────────
 * El filtro, el orden y el menú de la cuenta son la misma mecánica: un botón
 * que abre un panel, que se cierra al tocar fuera y con Escape. Escrita tres
 * veces, esa mecánica se arregla una vez y sigue rota en las otras dos — que
 * es exactamente como quedan los menús que se cierran solos en una pantalla y
 * en otra no.
 *
 * Lo que cambia entre ellos es el contenido, y eso es lo que se pasa.
 */
export function Menu({
  etiqueta,
  Icono,
  soloIcono = false,
  activo = false,
  alineado = 'derecha',
  direccion = 'abajo',
  ancho = 'w-64',
  tipo = 'menu',
  claseCaja,
  claseDisparador,
  disparador,
  children,
}: {
  /** Lo que dice el botón. Si `soloIcono`, pasa a ser su nombre accesible. */
  etiqueta: string;
  Icono?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  soloIcono?: boolean;
  /** Pinta el botón encendido: hay algo elegido aquí dentro. */
  activo?: boolean;
  alineado?: 'izquierda' | 'derecha';
  /**
   * Hacia dónde se abre. `arriba` para los disparadores que viven al pie de
   * algo: abriendo hacia abajo, el panel se sale de la pantalla y la mitad de
   * las opciones quedan fuera.
   */
  direccion?: 'abajo' | 'arriba';
  ancho?: string;
  /**
   * `menu` es una lista de acciones; `panel` es un formulario dentro de un
   * desplegable; `lista` es un campo que elige un valor entre varios.
   * Anunciar como menú algo que lleva selectores hace que un lector de
   * pantalla prometa "elige una opción" y entregue otra cosa.
   */
  tipo?: 'menu' | 'panel' | 'lista';
  /** Clases de la caja que envuelve todo. Para estirarla a lo ancho. */
  claseCaja?: string;
  /** Clases del botón cuando se pasa un `disparador` propio. */
  claseDisparador?: string;
  /** Reemplaza el botón por completo (el avatar, por ejemplo). */
  disparador?: (props: { abierto: boolean }) => ReactNode;
  children: ReactNode | ((cerrar: () => void) => ReactNode);
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    const fuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <div ref={caja} className={cn('relative', claseCaja)}>
      {disparador ? (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-haspopup={ARIA[tipo]}
          className={
            claseDisparador ??
            'flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          }
        >
          {disparador({ abierto })}
        </button>
      ) : (
        <Button
          type="button"
          variant="herramienta"
          size={soloIcono ? 'chip-icon' : 'chip'}
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-haspopup={ARIA[tipo]}
          // Encendido cuando hay algo elegido aquí dentro, o mientras está
          // abierto: el propio estilo lo resuelve la variante.
          aria-pressed={activo || abierto}
          aria-label={soloIcono ? etiqueta : undefined}
          title={soloIcono ? etiqueta : undefined}
        >
          {Icono && <Icono className="size-4 shrink-0" aria-hidden={true} />}
          {!soloIcono && <span className="truncate">{etiqueta}</span>}
          {!soloIcono && (
            <ChevronDown
              className={cn('size-3.5 shrink-0 opacity-60 transition-transform', abierto && 'rotate-180')}
              aria-hidden={true}
            />
          )}
        </Button>
      )}

      {abierto && (
        <div
          role={ROL[tipo]}
          aria-label={etiqueta}
          className={cn(
            'absolute z-30 overflow-hidden rounded-2xl bg-popover py-1.5',
            direccion === 'arriba' ? 'bottom-full mb-2' : 'top-full mt-2',
            'shadow-[var(--sombra-flotante)] ring-1 ring-black/5 dark:ring-white/12',
            ancho,
            'max-w-[calc(100vw-2rem)]',
            alineado === 'derecha' ? 'right-0' : 'left-0',
          )}
        >
          {typeof children === 'function' ? children(() => setAbierto(false)) : children}
        </div>
      )}
    </div>
  );
}

/** El rótulo de un bloque del menú: "Ordenar por", "Filtrar por"… */
export function MenuTitulo({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">{children}</p>
  );
}

export function MenuSeparador() {
  return <hr className="my-1.5 border-border" />;
}

/**
 * Una opción.
 *
 * La marca de elegida va a la DERECHA y el fondo cambia: la marca sola se
 * pierde al recorrer la lista con la vista, y el fondo solo no distingue lo
 * elegido de lo que está bajo el cursor.
 */
export function MenuOpcion({
  Icono,
  elegida = false,
  peligro = false,
  onClick,
  children,
}: {
  Icono?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  elegida?: boolean;
  /** Rojo. Reservado a lo que no se puede deshacer, como cerrar la sesión. */
  peligro?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
        peligro
          ? 'font-medium text-destructive hover:bg-destructive/10'
          : elegida
            ? 'bg-secondary font-medium text-foreground'
            : 'text-foreground hover:bg-secondary',
      )}
    >
      {Icono && <Icono className="size-4 shrink-0 opacity-70" aria-hidden={true} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {elegida && <Check className="size-4 shrink-0 text-primary" aria-hidden={true} />}
    </button>
  );
}
