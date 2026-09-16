import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { SUPERFICIE_FLOTANTE, SURGE } from '@/components/ui/superficie';
import { cn } from '@/lib/utils';

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
 * El mismo texto no se apila: reinicia su reloj. Diez toques seguidos en el
 * mismo sitio son una insistencia, no diez noticias.
 *
 * ── Dónde se pone ───────────────────────────────────────────────────────────
 * En el teléfono, POR ENCIMA de la barra de abajo: la esquina de siempre es
 * justo donde está la barra.
 */

interface Aviso {
  id: number;
  texto: string;
}

let avisos: Aviso[] = [];
let siguienteId = 1;
const oyentes = new Set<() => void>();
const relojes = new Map<number, ReturnType<typeof setTimeout>>();

/** Lo que dura en pantalla. Bastante para leer una línea, no tanto que estorbe. */
const DURACION = 4000;

function anunciar(): void {
  for (const oyente of oyentes) oyente();
}

function programarElOlvido(id: number): void {
  clearTimeout(relojes.get(id));
  relojes.set(
    id,
    setTimeout(() => {
      relojes.delete(id);
      avisos = avisos.filter((a) => a.id !== id);
      anunciar();
    }, DURACION),
  );
}

export function mostrarAviso(texto: string): void {
  const yaEsta = avisos.find((a) => a.texto === texto);
  if (yaEsta) {
    programarElOlvido(yaEsta.id);
    return;
  }

  const aviso = { id: siguienteId++, texto };
  avisos = [...avisos, aviso];
  programarElOlvido(aviso.id);
  anunciar();
}

/** Para las pruebas: deja la pila vacía y sin relojes pendientes. */
export function olvidarAvisos(): void {
  for (const reloj of relojes.values()) clearTimeout(reloj);
  relojes.clear();
  avisos = [];
  anunciar();
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useAvisos(): Aviso[] {
  return useSyncExternalStore(
    suscribir,
    () => avisos,
    () => avisos,
  );
}

/**
 * La pila. Se monta UNA vez, contra el `body`, desde el armazón.
 *
 * Contra el `body` y no dentro de la pantalla de turno porque un aviso
 * sobrevive a lo que lo lanzó: cerrar el panel que lo pidió no tiene por qué
 * llevárselo por delante.
 */
export function PilaDeAvisos() {
  const avisos = useAvisos();
  if (typeof document === 'undefined' || avisos.length === 0) return null;

  return createPortal(
    <div
      // Por encima del velo de una superficie (50) y de la barra (15): un
      // aviso que responde a algo que se pulsó DENTRO de un panel tiene que
      // verse sobre el panel.
      className="pointer-events-none fixed bottom-[var(--bajo-la-barra)] right-6 z-[60] flex flex-col gap-2 movil:left-4 movil:right-4"
      role="status"
      aria-live="polite"
    >
      {avisos.map((aviso) => (
        <p
          key={aviso.id}
          className={cn(
            'pointer-events-auto rounded-lg px-4 py-3 text-sm',
            SUPERFICIE_FLOTANTE,
            SURGE,
            'movil:max-w-none escritorio:max-w-sm',
          )}
        >
          {aviso.texto}
        </p>
      ))}
    </div>,
    document.body,
  );
}
