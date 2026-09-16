import { X } from 'lucide-react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';

import { Logo } from '@/components/logo';
import { EnlaceDeSeccion, MenuDeLaCuenta, type Seccion } from '@/components/navegacion';
import { Button } from '@/components/ui/button';
import { useDeslizarParaCerrar } from '@/lib/deslizar';
import { useEscape, useFocoAtrapado } from '@/lib/foco';
import { cn } from '@/lib/utils';

/**
 * Las secciones, a pantalla completa, desde la derecha.
 *
 * ── Por qué a pantalla completa y no un cajón estrecho ──────────────────────
 * Porque con filas de 48 para tocar, una lista de nueve entradas más la cuenta
 * ya llena un teléfono. Un cajón de 288 gastaría un tercio del ancho en un velo
 * que enseña una página que nadie está leyendo, para que la lista tenga que
 * desplazarse igual.
 *
 * ── Por qué 80vw y no todo ──────────────────────────────────────────────────
 * La franja de página que queda al lado es lo que dice que esto es un panel
 * SOBRE la página y no otra pantalla — y esa franja es un sitio donde tocar
 * para salir.
 *
 * ── Entra por el borde donde está su botón ──────────────────────────────────
 * El del menú está arriba a la derecha. Un panel que llega por el mismo borde
 * que el botón que lo abrió es el único movimiento que el ojo puede seguir de
 * vuelta.
 *
 * ── La salida es una equis, no un tirador ───────────────────────────────────
 * Una superficie a pantalla completa no deja ningún borde a la vista del que
 * colgar un tirador. Y la equis SUSTITUYE al tirador del riel del escritorio,
 * no se suma a él: aquel fija y suelta un riel, y en un teléfono no hay riel.
 * Un control se va, otro llega, y el panel nunca tiene dos formas de cambiar
 * de tamaño.
 *
 * ── Nada del riel ───────────────────────────────────────────────────────────
 * Fijar y asomar son cosas de puntero —asomar es pasar por encima, y un dedo
 * no pasa por encima de nada—. Aquí sencillamente no existen, en vez de estar
 * escritas en negativo en cada regla.
 */
export function PanelDeSecciones({
  abierta,
  diaADia,
  administracion,
  onCerrar,
}: {
  abierta: boolean;
  diaADia: readonly Seccion[];
  administracion: readonly Seccion[];
  onCerrar: () => void;
}) {
  const panel = useRef<HTMLElement>(null);

  useEscape(abierta, onCerrar);
  useFocoAtrapado(panel, abierta);
  useDeslizarParaCerrar({ elemento: panel, hacia: 'derecha', activo: abierta, onCerrar });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-superficie="secciones"
      data-abierta={abierta ? 'si' : 'no'}
      // El velo es el color de fondo del propio muelle, no un elemento aparte
      // ni una opacidad: el muelle ya era la caja que tapa la ventana y ya
      // recogía el toque de fuera.
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      className={cn(
        // Estirado por sus cuatro lados, nunca por un alto declarado. `dvh` es
        // la ventana de AHORA, mientras que el `bottom: 0` de algo fijo se
        // resuelve contra la ventana GRANDE: en cuanto la barra de direcciones
        // se retira, el muelle quedaría 90px más corto que la barra clavada al
        // otro borde, y el panel cerrado dejaría asomar una franja de verde.
        'fixed inset-0 z-50 flex justify-end',
        'transition-colors duration-200 ease-[ease]',
        abierta ? 'visible bg-[var(--velo)]' : 'invisible bg-transparent',
      )}
    >
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Secciones"
        tabIndex={-1}
        inert={!abierta}
        className={cn(
          'flex h-full w-[var(--ancho-secciones)] flex-col bg-sidebar p-3 outline-none',
          'transition-transform duration-[220ms] ease-[cubic-bezier(.4,0,.2,1)]',
          abierta ? 'translate-x-0' : 'translate-x-full',
          // La lista se desplaza en vertical; lo horizontal es del gesto.
          'touch-pan-y',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-2 px-2 pt-2">
          <Logo className="h-7 w-auto text-sidebar-active" />
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            onClick={onCerrar}
            aria-label="Cerrar el menú"
            className="text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Su propia lista sigue desplazándose: lo que se bloquea es la página
            de detrás, no esto. */}
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" aria-label="Secciones">
          {diaADia.map(({ to, label, Icono, exact }) => (
            <EnlaceDeSeccion key={to} to={to} exact={exact} titulo={label}>
              <Icono className="size-[18px] shrink-0" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden={true} />
              {label}
            </EnlaceDeSeccion>
          ))}

          {administracion.length > 0 && (
            <>
              <p className="mt-6 mb-1 px-3 text-xs font-semibold text-sidebar-muted">
                Administración
              </p>
              {administracion.map(({ to, label, Icono, exact }) => (
                <EnlaceDeSeccion key={to} to={to} exact={exact} titulo={label}>
                  <Icono className="size-[18px] shrink-0" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden={true} />
                  {label}
                </EnlaceDeSeccion>
              ))}
            </>
          )}
        </nav>

        <div className="mt-4 shrink-0 border-t border-sidebar-border pt-3 pb-[env(safe-area-inset-bottom,0px)]">
          <MenuDeLaCuenta />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
