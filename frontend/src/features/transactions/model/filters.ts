import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useHistory } from '@/features/transactions/api/transactions';
import { t } from '@/shared/lib/i18n';

/**
 * Filtros compartidos por el Resumen y los Movimientos.
 *
 * ── Por qué viven en la URL ─────────────────────────────────────────────────
 * Porque son el RECORTE que la persona está mirando, no un estado interno de
 * una pantalla. Al saltar del resumen a los movimientos el recorte se mantiene,
 * el botón de atrás funciona, y un enlace pegado a alguien abre exactamente lo
 * mismo. Guardados en memoria, cada salto los perdería.
 */

export type Preset =
  | 'todo'
  | 'mes-actual'
  | 'mes-pasado'
  | 'trimestre'
  | 'anio-actual'
  | 'anio-pasado'
  | 'personalizado';

export const PRESETS: { value: Preset; label: string; help: string }[] = [
  {
    value: 'todo',
    label: t('transactions.range.presets.all'),
    help: t('transactions.range.presets.allHelp'),
  },
  {
    value: 'mes-actual',
    label: t('transactions.range.presets.thisMonth'),
    help: t('transactions.range.presets.thisMonthHelp'),
  },
  {
    value: 'mes-pasado',
    label: t('transactions.range.presets.lastMonth'),
    help: t('transactions.range.presets.lastMonthHelp'),
  },
  {
    value: 'trimestre',
    label: t('transactions.range.presets.last3Months'),
    help: t('transactions.range.presets.last3MonthsHelp'),
  },
  {
    value: 'anio-actual',
    label: t('transactions.range.presets.thisYear'),
    help: t('transactions.range.presets.thisYearHelp'),
  },
  {
    value: 'anio-pasado',
    label: t('transactions.range.presets.lastYear'),
    help: t('transactions.range.presets.lastYearHelp'),
  },
  {
    value: 'personalizado',
    label: t('transactions.range.presets.custom'),
    help: t('transactions.range.presets.customHelp'),
  },
];

/**
 * Hoy en America/Bogota (UTC−5, sin horario de verano).
 *
 * No se usa `new Date()` a secas: el navegador puede estar en otra zona, y
 * entonces "hoy" cambiaría según dónde esté la persona. El mes de la app tiene
 * que empezar y terminar igual para todos.
 */
function todayInBogota(): Date {
  const now = new Date();
  return new Date(now.getTime() - 5 * 60 * 60 * 1000);
}

const aISO = (date: Date): string => date.toISOString().slice(0, 10);

/** Hoy en Bogotá, en `YYYY-MM-DD`. */
function todayIso(): string {
  return aISO(todayInBogota());
}

/**
 * Si el recorte que se está mirando llega hasta hoy.
 *
 * Lo usan las piezas que hablan del MES EN CURSO —el presupuesto necesario y
 * los pagos pendientes— para saber si tienen algo que decir. Mirando agosto de
 * 2024, "lo que falta pagar este mes" no es una respuesta tardía: es la
 * respuesta a otra pregunta, puesta al lado de las cifras de un periodo que ya
 * cerró. Y ahí no hay nada pendiente, porque ya pasó.
 */
export function reachesToday(filters: { to: string }): boolean {
  return filters.to >= todayIso();
}
const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month, day));

/**
 * El rango de fechas que representa un preset.
 *
 * `historia` son las fechas del primer y el último movimiento. Solo la usa
 * "Todo", y es opcional porque llega de una consulta: mientras no esté, se cae
 * a un rango amplio, que devuelve exactamente los mismos movimientos.
 */
export function rangeOf(
  preset: Preset,
  history?: { first: string | null; last: string | null },
): { from: string; to: string } {
  const today = todayInBogota();
  const a = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();

  switch (preset) {
    case 'todo':
      // Arranca en el PRIMER movimiento, no en 1970: con 1970 la gráfica
      // estiraba su eje sobre medio siglo vacío para dibujar cuatro años de
      // datos, y el botón de fechas prometía un periodo que nunca existió.
      return {
        from: history?.first ?? '1970-01-01',
        to: history?.last ?? aISO(utc(a + 5, 11, 31)),
      };

    case 'mes-actual':
      // HASTA HOY, no hasta fin de mes: incluir días que no han ocurrido
      // aplanaría cualquier promedio y haría parecer que se gastó de menos.
      return { from: aISO(utc(a, m, 1)), to: aISO(utc(a, m, d)) };

    case 'mes-pasado':
      return { from: aISO(utc(a, m - 1, 1)), to: aISO(utc(a, m, 0)) };

    case 'trimestre':
      // Tres meses hacia atrás desde hoy, no "el trimestre calendario": el 2 de
      // abril uno quiere ver enero–abril, no solo los dos días de abril.
      return { from: aISO(utc(a, m - 2, 1)), to: aISO(utc(a, m, d)) };

    case 'anio-actual':
      return { from: aISO(utc(a, 0, 1)), to: aISO(utc(a, m, d)) };

    case 'anio-pasado':
      return { from: aISO(utc(a - 1, 0, 1)), to: aISO(utc(a - 1, 11, 31)) };

    case 'personalizado':
    default:
      return { from: aISO(utc(a, m, 1)), to: aISO(utc(a, m, d)) };
  }
}

export interface Filters {
  preset: Preset;
  from: string;
  to: string;
  /**
   * Centros de costos, categorías o conceptos marcados. Cada uno incluye su rama.
   *
   * Es una LISTA porque el panel son casillas: la pregunta "¿cuánto me cuestan
   * Casa y Transporte juntos?" no se puede hacer con un solo id.
   */
  categoryIds: number[];
  q?: string | undefined;
}

/**
 * Lee y escribe los filtros en la URL.
 *
 * El preset se guarda además del rango a propósito. Guardar solo las fechas
 * obligaría a adivinar qué botón estaba activo, y "del 1 al 30 de septiembre"
 * puede ser tanto "mes en curso" como un rango escrito a mano: son estados
 * distintos, porque el primero se mueve solo al día siguiente.
 */
export function useFilters(defaultPreset: Preset = 'mes-actual'): {
  filters: Filters;
  apply: (changes: Partial<Filters>) => void;
  clear: () => void;
  hasActiveFilters: boolean;
} {
  const [params, setParams] = useSearchParams();
  const history = useHistory();

  const filters = useMemo<Filters>(() => {
    const preset = (params.get('rango') as Preset | null) ?? defaultPreset;
    const range = rangeOf(preset, history.data);

    return {
      preset,
      from: preset === 'personalizado' ? (params.get('desde') ?? range.from) : range.from,
      to: preset === 'personalizado' ? (params.get('hasta') ?? range.to) : range.to,
      categoryIds: (params.get('categorias') ?? '')
        .split(',')
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0),
      q: params.get('busca') ?? undefined,
    };
  }, [params, defaultPreset, history.data]);

  const apply = useCallback(
    (changes: Partial<Filters>) => {
      const next = writeFilters(params, changes, defaultPreset);

      setParams(next, { replace: true });
    },
    [params, setParams, defaultPreset],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const hasActiveFilters =
    filters.preset !== defaultPreset || filters.categoryIds.length > 0 || (filters.q ?? '') !== '';

  return { filters, apply, clear, hasActiveFilters };
}

/** Los filtros tal como los espera la API. */
export function toApiParams(filters: Filters): {
  from: string;
  to: string;
  categoryIds?: string;
  q?: string;
} {
  return {
    from: filters.from,
    to: filters.to,
    ...(filters.categoryIds.length > 0 && { categoryIds: filters.categoryIds.join(',') }),
    ...(filters.q && { q: filters.q }),
  };
}

/** Los parámetros de la URL después de aplicar unos cambios a los filtros. */
function writeFilters(
  params: URLSearchParams,
  changes: Partial<Filters>,
  defaultPreset: Preset,
): URLSearchParams {
  const next = new URLSearchParams(params);

  if (changes.preset !== undefined) {
    if (changes.preset === defaultPreset) next.delete('rango');
    else next.set('rango', changes.preset);

    // Cambiar de preset descarta las fechas escritas a mano: dejarlas haría
    // que el rango mostrado no fuera el del botón encendido.
    if (changes.preset !== 'personalizado') {
      next.delete('desde');
      next.delete('hasta');
    }
  }

  // Escribir una fecha a mano implica pasar a personalizado, o el rango se
  // recalcularía desde el preset y el cambio se perdería al instante.
  if (changes.from !== undefined) {
    next.set('desde', changes.from);
    next.set('rango', 'personalizado');
  }
  if (changes.to !== undefined) {
    next.set('hasta', changes.to);
    next.set('rango', 'personalizado');
  }

  if (changes.categoryIds !== undefined) {
    if (changes.categoryIds.length === 0) next.delete('categorias');
    else next.set('categorias', changes.categoryIds.join(','));
  }
  if (changes.q !== undefined) {
    if (changes.q.trim() === '') next.delete('busca');
    else next.set('busca', changes.q);
  }

  return next;
}
