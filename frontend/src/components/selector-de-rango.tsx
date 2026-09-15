import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { PRESETS, rangoDe, type Filtros, type Preset } from '@/lib/filtros';
import { cn } from '@/lib/utils';

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * La semana empieza en LUNES, no en domingo: es como se lee un calendario en
 * Colombia, y el fin de semana queda junto al final de la fila en vez de
 * partido entre las dos puntas.
 */
const DIAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];

const aISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);
const utc = (anio: number, mes: number, dia: number): Date => new Date(Date.UTC(anio, mes, dia));

/** `2026-03-14` → `14 mar 2026`. Las fechas en ISO no se leen de un vistazo. */
function bonita(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m} ${a}`;
}

/**
 * `1 sep — 10 sep 2026`, con el año una sola vez cuando el rango no lo cruza.
 * Repetirlo en los dos extremos ocupa sitio sin decir nada nuevo.
 */
export function rangoBonito(desde: string, hasta: string): string {
  if (desde.slice(0, 4) !== hasta.slice(0, 4)) return `${bonita(desde)} — ${bonita(hasta)}`;
  const [, m, d] = desde.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} — ${bonita(hasta)}`;
}

/** Las dos fechas en orden, vengan como vengan: se puede pintar al revés. */
function ordenadas(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/**
 * Las celdas de un mes, alineadas a la rejilla de siete columnas.
 *
 * Los huecos del principio y del final son `null` en vez de días del mes
 * vecino: un día gris que sí se puede pulsar confunde sobre qué mes se está
 * mirando, y uno que no se puede pulsar es ruido.
 */
export function celdasDelMes(anio: number, mes: number): (string | null)[] {
  // getUTCDay() cuenta desde el domingo; con +6 %7 el lunes pasa a ser 0.
  const hueco = (utc(anio, mes, 1).getUTCDay() + 6) % 7;
  const total = utc(anio, mes + 1, 0).getUTCDate();

  const celdas: (string | null)[] = Array.from({ length: hueco }, () => null);
  for (let dia = 1; dia <= total; dia += 1) celdas.push(aISO(utc(anio, mes, dia)));
  while (celdas.length % 7 !== 0) celdas.push(null);

  return celdas;
}

interface Borrador {
  preset: Preset;
  from: string;
  to: string;
}

/** El mes que conviene mostrar al abrir: donde termina el rango. */
function mesDelBorrador(b: Borrador): { anio: number; mes: number } {
  // En "Todo" el rango llega cinco años al futuro; abrir allá no ayuda a nadie.
  const ancla = b.preset === 'todo' ? aISO(new Date()) : b.to;
  const [a, m] = ancla.split('-');
  return { anio: Number(a), mes: Number(m) - 1 };
}

/**
 * El selector de rango de tiempo.
 *
 * ── Por qué un desplegable y no pestañas ────────────────────────────────────
 * Seis pestañas siempre visibles ocupan una fila entera, se desbordan en un
 * teléfono y obligan a leer todas las opciones aunque solo importe la activa.
 * Un control único muestra QUÉ RANGO se está viendo —que es la información
 * útil— y esconde el resto hasta que alguien quiera cambiarlo.
 *
 * ── Por qué los atajos y el calendario van juntos ───────────────────────────
 * No son dos controles distintos, son dos formas de decir lo mismo: "el mes en
 * curso" y "del 1 al 15 de septiembre" producen el mismo recorte. Separarlos
 * obligaría a buscar en qué sitio está el que uno necesita.
 *
 * ── Por qué hay que confirmar con Aplicar ───────────────────────────────────
 * Elegir un rango a mano son DOS clics, y entre el primero y el segundo el
 * rango está a medias. Si cada clic recargara, la pantalla se refrescaría con
 * un recorte que nadie pidió —el día suelto del primer clic— y el segundo
 * llegaría tarde. El borrador vive aquí dentro hasta que se confirma.
 */
export function SelectorDeRango({
  filtros,
  aplicar,
}: {
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>({
    preset: filtros.preset,
    from: filtros.from,
    to: filtros.to,
  });
  /** El primer clic, a la espera del segundo. `null` = no hay nada a medias. */
  const [ancla, setAncla] = useState<string | null>(null);
  const [sobrevolado, setSobrevolado] = useState<string | null>(null);
  const [vista, setVista] = useState(() =>
    mesDelBorrador({ preset: filtros.preset, from: filtros.from, to: filtros.to }),
  );
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al tocar fuera y con Escape: un panel que solo se cierra con su
  // propio botón se queda abierto tapando el contenido.
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

  function abrir(): void {
    // El borrador se rehace en cada apertura: si se canceló la vez anterior,
    // lo que quedó a medias no tiene por qué reaparecer.
    const fresco: Borrador = { preset: filtros.preset, from: filtros.from, to: filtros.to };
    setBorrador(fresco);
    setVista(mesDelBorrador(fresco));
    setAncla(null);
    setSobrevolado(null);
    setAbierto(true);
  }

  function elegirPreset(preset: Preset): void {
    const siguiente: Borrador = { preset, ...rangoDe(preset) };
    setBorrador(siguiente);
    setVista(mesDelBorrador(siguiente));
    setAncla(null);
    setSobrevolado(null);
  }

  function elegirDia(iso: string): void {
    if (ancla === null) {
      setAncla(iso);
      setSobrevolado(iso);
      return;
    }
    setBorrador({ preset: 'personalizado', ...ordenadas(ancla, iso) });
    setAncla(null);
    setSobrevolado(null);
  }

  function confirmar(): void {
    if (borrador.preset === 'personalizado') {
      aplicar({ preset: 'personalizado', from: borrador.from, to: borrador.to });
    } else {
      aplicar({ preset: borrador.preset });
    }
    setAbierto(false);
  }

  const activo = PRESETS.find((p) => p.valor === filtros.preset);
  const etiqueta =
    filtros.preset === 'todo'
      ? 'Todo el histórico'
      : filtros.preset === 'personalizado'
        ? rangoBonito(filtros.from, filtros.to)
        : (activo?.etiqueta ?? 'Rango');

  // Mientras hay un clic a medias manda la selección en curso, no el borrador:
  // así se ve crecer el rango con el ratón antes de fijarlo.
  const pintado = ancla !== null ? ordenadas(ancla, sobrevolado ?? ancla) : borrador;
  // En "Todo" el rango va de 1970 a dentro de cinco años: pintarlo dejaría el
  // calendario entero coloreado, que no informa de nada.
  const pinta = borrador.preset !== 'todo' || ancla !== null;

  const celdas = celdasDelMes(vista.anio, vista.mes);
  const hoy = aISO(new Date());

  function moverMes(pasos: number): void {
    const d = utc(vista.anio, vista.mes + pasos, 1);
    setVista({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() });
  }

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium',
          'transition-colors hover:bg-secondary sm:w-auto',
        )}
        style={{ borderColor: 'var(--input)' }}
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">{etiqueta}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Elegir rango de tiempo"
          className={cn(
            'absolute left-0 z-30 mt-2 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-popover',
            'shadow-[0_4px_12px_rgba(12,31,24,0.08),0_16px_40px_-12px_rgba(12,31,24,0.25)]',
          )}
        >
          <div className="flex flex-col sm:flex-row">
            {/* ── Atajos ──────────────────────────────────────────────────
                En pantalla ancha son una columna; en un teléfono se vuelven
                fichas que fluyen, porque una columna lateral dejaría el
                calendario en la mitad del ancho y sin sitio para los días. */}
            <ul
              className={cn(
                'flex flex-wrap gap-1 border-b border-border p-2',
                'sm:w-44 sm:shrink-0 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r',
              )}
            >
              {PRESETS.filter((p) => p.valor !== 'personalizado').map((p) => (
                <li key={p.valor} className="sm:w-full">
                  <button
                    type="button"
                    onClick={() => elegirPreset(p.valor)}
                    aria-pressed={borrador.preset === p.valor}
                    title={p.ayuda}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      borrador.preset === p.valor
                        ? 'bg-secondary font-semibold text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {p.etiqueta}
                  </button>
                </li>
              ))}
            </ul>

            {/* ── Calendario ─────────────────────────────────────────────── */}
            <div className="min-w-0 flex-1 p-3">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => moverMes(-1)}
                  aria-label="Mes anterior"
                  className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <span aria-live="polite" className="font-display text-sm font-semibold">
                  {MESES_LARGOS[vista.mes]} {vista.anio}
                </span>
                <button
                  type="button"
                  onClick={() => moverMes(1)}
                  aria-label="Mes siguiente"
                  className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-7">
                {DIAS.map((d) => (
                  <span
                    key={d}
                    aria-hidden="true"
                    className="grid h-8 place-items-center text-xs font-medium text-muted-foreground"
                  >
                    {d}
                  </span>
                ))}
              </div>

              {/* Sin separación entre celdas: la banda del rango tiene que ser
                  continua, y un hueco la partiría en cuadritos sueltos. */}
              <div className="grid grid-cols-7" onMouseLeave={() => ancla && setSobrevolado(ancla)}>
                {celdas.map((iso, i) => {
                  if (iso === null) return <span key={`hueco-${i}`} className="h-9" />;

                  const dentro = pinta && iso >= pintado.from && iso <= pintado.to;
                  const esInicio = pinta && iso === pintado.from;
                  const esFin = pinta && iso === pintado.to;
                  const extremo = esInicio || esFin;

                  return (
                    <div
                      key={iso}
                      className={cn(
                        'h-9',
                        dentro && 'bg-bosque-100 dark:bg-bosque-700',
                        // Las puntas se redondean también al principio y al
                        // final de cada fila, o la banda quedaría cortada a
                        // ras contra el borde del calendario.
                        (esInicio || i % 7 === 0) && 'rounded-l-full',
                        (esFin || i % 7 === 6) && 'rounded-r-full',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => elegirDia(iso)}
                        onMouseEnter={() => ancla && setSobrevolado(iso)}
                        aria-label={bonita(iso)}
                        aria-pressed={extremo}
                        className={cn(
                          'size-9 rounded-full text-sm transition-colors',
                          extremo
                            ? 'bg-primary font-semibold text-primary-foreground'
                            : dentro
                              ? 'text-foreground hover:bg-secondary'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                          // Hoy lleva anillo, no relleno: el relleno es del
                          // rango elegido y competirían por significar lo mismo.
                          iso === hoy && !extremo && 'ring-1 ring-inset ring-input font-semibold text-foreground',
                        )}
                      >
                        {Number(iso.slice(8))}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {ancla !== null
                ? 'Elige la fecha final'
                : borrador.preset === 'todo'
                  ? 'Todo el histórico'
                  : rangoBonito(borrador.from, borrador.to)}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={confirmar} disabled={ancla !== null}>
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { Preset };
