import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

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
  ancho = 'w-64',
  tipo = 'menu',
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
  ancho?: string;
  /**
   * `menu` es una lista de opciones; `panel` es un formulario dentro de un
   * desplegable. Anunciar como menú algo que lleva selectores hace que un
   * lector de pantalla prometa "elige una opción" y entregue otra cosa.
   */
  tipo?: 'menu' | 'panel';
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
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup={tipo === 'menu' ? 'menu' : 'dialog'}
        aria-label={soloIcono ? etiqueta : undefined}
        title={soloIcono ? etiqueta : undefined}
        className={
          disparador
            ? 'flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            : cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border text-sm font-medium transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                soloIcono ? 'w-9 justify-center' : 'px-3',
                activo || abierto
                  ? 'border-primary/30 bg-accent text-accent-foreground'
                  : 'border-border bg-card text-foreground hover:bg-secondary',
              )
        }
      >
        {disparador ? (
          disparador({ abierto })
        ) : (
          <>
            {Icono && <Icono className="size-4 shrink-0" aria-hidden={true} />}
            {!soloIcono && <span className="truncate">{etiqueta}</span>}
            {!soloIcono && (
              <ChevronDown
                className={cn('size-3.5 shrink-0 opacity-60 transition-transform', abierto && 'rotate-180')}
                aria-hidden={true}
              />
            )}
          </>
        )}
      </button>

      {abierto && (
        <div
          role={tipo === 'menu' ? 'menu' : 'dialog'}
          aria-label={etiqueta}
          className={cn(
            'absolute z-30 mt-2 overflow-hidden rounded-2xl bg-popover py-1.5',
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
