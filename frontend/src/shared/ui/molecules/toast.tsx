import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { useSyncExternalStore, type ComponentType } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/lib/utils';
import type { AlertTone } from '@/shared/ui/atoms/alert';
import { FLOATING_SURFACE, SURGE } from '@/shared/ui/foundations/surface';

/**
 * Un aviso.
 *
 * ── Para qué ────────────────────────────────────────────────────────────────
 * Para responder a algo que se acaba de pulsar y no tiene otra respuesta. El
 * caso que lo trajo: pedir un atajo número diez.
 *
 * Y no un contador ("9 de 9", que gasta sitio permanente en una regla que
 * importa una vez de cada cuarenta) ni un control apagado (que no responde
 * nada cuando se pulsa, porque no se puede pulsar). La respuesta llega cuando
 * se hace la pregunta.
 *
 * ── Una tarjeta, se pulse las veces que se pulse ────────────────────────────
 * El mismo aviso no se apila: reinicia su reloj. Diez toques seguidos en el
 * mismo sitio son una insistencia, no diez noticias.
 *
 * ── Dónde se pone ───────────────────────────────────────────────────────────
 * En el teléfono, POR ENCIMA de la barra de abajo: la esquina de siempre es
 * justo donde está la barra.
 *
 * ── Titular y detalle ───────────────────────────────────────────────────────
 * Dos líneas y no una: el titular dice QUÉ pasó en tres palabras —se lee de
 * reojo, que es como se leen los avisos— y el detalle explica. Con una sola
 * línea había que elegir entre ser legible de un vistazo o ser útil.
 *
 * El detalle es opcional. Un aviso que no necesita explicación no se inventa
 * una.
 *
 * ── Los tonos ───────────────────────────────────────────────────────────────
 * Los mismos cuatro que el aviso en línea, con TRES señales a la vez para
 * cada uno y a propósito:
 *
 * · Una pastilla redonda del color de la severidad, con su glifo encima. El
 *   color solo no basta: uno de cada doce hombres no distingue el rojo del
 *   verde, así que la forma —palomita, triángulo, aspa— dice lo mismo por
 *   otra vía.
 * · Un resplandor del mismo color entrando por el borde izquierdo, que tiñe
 *   la tarjeta sin llegar a colorearla.
 * · El halo de la pastilla, que es el mismo color al 15 %.
 *
 * ── Por qué la superficie NO se tiñe entera ─────────────────────────────────
 * Porque un aviso flotante está encima de todo lo demás, y lo que dice que
 * está encima es la sombra sobre el color del popover. Teñir el rectángulo
 * entero de rojo rompe esa lectura: deja de parecer una capa y pasa a parecer
 * un cartel. El resplandor del borde da el color sin perder la elevación.
 */

interface ToastEntry {
  id: number;
  title: string;
  detail?: string | undefined;
  tone: AlertTone;
}

/**
 * El glifo de cada tono, y por qué NO son los del aviso en línea.
 *
 * Allí el icono va suelto sobre el texto, así que lleva su propio contorno
 * —`CircleCheck`, `CircleAlert`—. Aquí va DENTRO de una pastilla que ya es un
 * círculo: con un icono circular, el resultado son dos círculos concéntricos y
 * el glifo se pierde. Así que aquí van los trazos desnudos.
 */
const GLYPHS: Record<AlertTone, ComponentType<{ className?: string }> | null> = {
  default: null,
  destructive: X,
  warning: TriangleAlert,
  success: Check,
  info: Info,
};

/**
 * Los tres colores de cada tono, escritos y no calculados.
 *
 * Tailwind no ve una clase construida con una plantilla —`bg-${tono}` no
 * existe en el CSS final—, así que cada combinación se escribe entera. Es la
 * misma razón por la que los pasteles de los chips son una tabla.
 */
const COLORS: Record<AlertTone, { pill: string; halo: string; glow: string }> = {
  default: { pill: '', halo: '', glow: '' },
  destructive: {
    pill: 'bg-destructive text-destructive-foreground',
    halo: 'bg-destructive/15',
    glow: 'bg-gradient-to-r from-destructive/20 to-transparent to-65%',
  },
  warning: {
    pill: 'bg-warning text-warning-foreground',
    halo: 'bg-warning/15',
    glow: 'bg-gradient-to-r from-warning/20 to-transparent to-65%',
  },
  success: {
    pill: 'bg-success text-success-foreground',
    halo: 'bg-success/15',
    glow: 'bg-gradient-to-r from-success/20 to-transparent to-65%',
  },
  info: {
    pill: 'bg-info text-info-foreground',
    halo: 'bg-info/15',
    glow: 'bg-gradient-to-r from-info/20 to-transparent to-65%',
  },
};

let toasts: ToastEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** Lo que dura en pantalla. Bastante para leer dos líneas, no tanto que estorbe. */
const DURATION_MS = 5000;

function notify(): void {
  for (const listener of listeners) listener();
}

function scheduleDismiss(id: number): void {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      toasts = toasts.filter((a) => a.id !== id);
      notify();
    }, DURATION_MS),
  );
}

export function showToast(
  title: string,
  options: { detail?: string; tone?: AlertTone } = {},
): void {
  const { detail, tone = 'default' } = options;

  // El mismo aviso reinicia su reloj en vez de apilarse. Se compara por lo que
  // DICE —titular y detalle—, no por el tono: el mismo texto con otro tono
  // sería el mismo aviso contado dos veces.
  const existing = toasts.find((a) => a.title === title && a.detail === detail);
  if (existing) {
    scheduleDismiss(existing.id);
    return;
  }

  const toast: ToastEntry = { id: nextId++, title, detail, tone };
  toasts = [...toasts, toast];
  scheduleDismiss(toast.id);
  notify();
}

/** Para las pruebas: deja la pila vacía y sin relojes pendientes. */
export function clearToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  toasts = [];
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useToasts(): ToastEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => toasts,
  );
}

/**
 * La pila. Se monta UNA vez, contra el `body`, desde el armazón.
 *
 * Contra el `body` y no dentro de la pantalla de turno porque un aviso
 * sobrevive a lo que lo lanzó: cerrar el panel que lo pidió no tiene por qué
 * llevárselo por delante.
 */
export function ToastStack() {
  const toasts = useToasts();
  if (typeof document === 'undefined' || toasts.length === 0) return null;

  return createPortal(
    <div
      // Por encima del velo de una superficie (50) y de la barra (15): un
      // aviso que responde a algo que se pulsó DENTRO de un panel tiene que
      // verse sobre el panel.
      className="pointer-events-none fixed bottom-[var(--bajo-la-barra)] right-6 z-[60] flex flex-col gap-2 movil:left-4 movil:right-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  );
}

function Toast({ toast }: { toast: ToastEntry }) {
  const Glyph = GLYPHS[toast.tone];
  const color = COLORS[toast.tone];

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-lg p-4',
        FLOATING_SURFACE,
        SURGE,
        'movil:max-w-none escritorio:w-[26rem]',
      )}
    >
      {/*
        El resplandor, en su propia capa detrás del contenido.

        En la misma capa que la tarjeta habría que elegir entre el color
        del popover y el degradado, porque los dos son `background`;
        aquí el popover se queda de fondo y el degradado se apoya
        encima, con el texto por delante.
      */}
      {color.glow && (
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute inset-0', color.glow)}
        />
      )}

      {Glyph && (
        <span
          aria-hidden="true"
          className={cn(
            'relative grid size-10 shrink-0 place-items-center rounded-full',
            color.halo,
          )}
        >
          <span className={cn('grid size-7 place-items-center rounded-full', color.pill)}>
            <Glyph className="size-4" />
          </span>
        </span>
      )}

      <span className="relative min-w-0">
        <span className="block text-sm font-semibold leading-tight">{toast.title}</span>
        {toast.detail && (
          <span className="mt-1 block text-sm leading-snug text-muted-foreground">
            {toast.detail}
          </span>
        )}
      </span>
    </div>
  );
}
