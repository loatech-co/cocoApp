import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { ICONOS_DE_TONO, type TonoDeAviso } from '@/components/ui/alert';
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
 *
 * ── Los tonos, y por qué el fondo NO se tiñe ────────────────────────────────
 * Los mismos cuatro que el aviso en línea —`warning`, `info`, `success`,
 * `destructive`— y con los mismos iconos, importados de allí: un error que en
 * línea es un círculo y flotando es un triángulo son dos errores distintos
 * para quien mira.
 *
 * Lo que cambia es el ICONO y su color, no la superficie. Un aviso flotante
 * está encima de todo lo demás, y lo que dice que está encima es la sombra
 * sobre el color del popover; teñir el rectángulo entero de rojo o de verde
 * rompe esa lectura —deja de parecer una capa y pasa a parecer un cartel— y
 * además obliga a un segundo juego de sombras para cada tono.
 *
 * El color solo tampoco bastaría: uno de cada doce hombres no distingue el
 * rojo del verde. Por eso el tono siempre viene con su forma.
 */

interface Aviso {
  id: number;
  texto: string;
  tono: TonoDeAviso;
}

/** El color del icono de cada tono. La superficie no cambia. */
const TINTA: Record<TonoDeAviso, string> = {
  default: 'text-muted-foreground',
  destructive: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
  info: 'text-info',
};

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

export function mostrarAviso(texto: string, tono: TonoDeAviso = 'default'): void {
  const yaEsta = avisos.find((a) => a.texto === texto);
  if (yaEsta) {
    programarElOlvido(yaEsta.id);
    return;
  }

  const aviso = { id: siguienteId++, texto, tono };
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
      {avisos.map((aviso) => {
        const Icono = ICONOS_DE_TONO[aviso.tono];

        return (
          <div
            key={aviso.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm',
              SUPERFICIE_FLOTANTE,
              SURGE,
              'movil:max-w-none escritorio:max-w-sm',
            )}
          >
            {Icono && (
              <Icono className={cn('mt-0.5 size-4 shrink-0', TINTA[aviso.tono])} aria-hidden="true" />
            )}
            <p className="min-w-0">{aviso.texto}</p>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
