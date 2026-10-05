import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useHistoria } from '@/features/transactions/api/transactions';

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

export const PRESETS: { valor: Preset; etiqueta: string; ayuda: string }[] = [
  { valor: 'todo', etiqueta: 'Todo', ayuda: 'Sin límite de fechas' },
  { valor: 'mes-actual', etiqueta: 'Mes en curso', ayuda: 'Del 1 hasta hoy' },
  { valor: 'mes-pasado', etiqueta: 'Mes pasado', ayuda: 'El mes anterior completo' },
  { valor: 'trimestre', etiqueta: 'Últimos 3 meses', ayuda: 'Los tres meses anteriores a hoy' },
  { valor: 'anio-actual', etiqueta: 'Año en curso', ayuda: 'Del 1 de enero hasta hoy' },
  { valor: 'anio-pasado', etiqueta: 'Año pasado', ayuda: 'El año anterior completo' },
  { valor: 'personalizado', etiqueta: 'Personalizado', ayuda: 'Elige las dos fechas' },
];

/**
 * Hoy en America/Bogota (UTC−5, sin horario de verano).
 *
 * No se usa `new Date()` a secas: el navegador puede estar en otra zona, y
 * entonces "hoy" cambiaría según dónde esté la persona. El mes de la app tiene
 * que empezar y terminar igual para todos.
 */
function hoyEnBogota(): Date {
  const ahora = new Date();
  return new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
}

const aISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/** Hoy en Bogotá, en `YYYY-MM-DD`. */
function hoyISO(): string {
  return aISO(hoyEnBogota());
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
export function llegaHastaHoy(filtros: { to: string }): boolean {
  return filtros.to >= hoyISO();
}
const utc = (anio: number, mes: number, dia: number): Date => new Date(Date.UTC(anio, mes, dia));

/**
 * El rango de fechas que representa un preset.
 *
 * `historia` son las fechas del primer y el último movimiento. Solo la usa
 * "Todo", y es opcional porque llega de una consulta: mientras no esté, se cae
 * a un rango amplio, que devuelve exactamente los mismos movimientos.
 */
export function rangoDe(
  preset: Preset,
  historia?: { first: string | null; last: string | null },
): { from: string; to: string } {
  const hoy = hoyEnBogota();
  const a = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  const d = hoy.getUTCDate();

  switch (preset) {
    case 'todo':
      // Arranca en el PRIMER movimiento, no en 1970: con 1970 la gráfica
      // estiraba su eje sobre medio siglo vacío para dibujar cuatro años de
      // datos, y el botón de fechas prometía un periodo que nunca existió.
      return {
        from: historia?.first ?? '1970-01-01',
        to: historia?.last ?? aISO(utc(a + 5, 11, 31)),
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

export interface Filtros {
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
export function useFiltros(porDefecto: Preset = 'mes-actual'): {
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
  limpiar: () => void;
  hayFiltrosActivos: boolean;
} {
  const [params, setParams] = useSearchParams();
  const historia = useHistoria();

  const filtros = useMemo<Filtros>(() => {
    const preset = (params.get('rango') as Preset | null) ?? porDefecto;
    const rango = rangoDe(preset, historia.data);

    return {
      preset,
      from: preset === 'personalizado' ? (params.get('desde') ?? rango.from) : rango.from,
      to: preset === 'personalizado' ? (params.get('hasta') ?? rango.to) : rango.to,
      categoryIds: (params.get('categorias') ?? '')
        .split(',')
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0),
      q: params.get('busca') ?? undefined,
    };
  }, [params, porDefecto, historia.data]);

  const aplicar = useCallback(
    (cambios: Partial<Filtros>) => {
      const siguiente = new URLSearchParams(params);

      if (cambios.preset !== undefined) {
        if (cambios.preset === porDefecto) siguiente.delete('rango');
        else siguiente.set('rango', cambios.preset);

        // Cambiar de preset descarta las fechas escritas a mano: dejarlas haría
        // que el rango mostrado no fuera el del botón encendido.
        if (cambios.preset !== 'personalizado') {
          siguiente.delete('desde');
          siguiente.delete('hasta');
        }
      }

      // Escribir una fecha a mano implica pasar a personalizado, o el rango se
      // recalcularía desde el preset y el cambio se perdería al instante.
      if (cambios.from !== undefined) {
        siguiente.set('desde', cambios.from);
        siguiente.set('rango', 'personalizado');
      }
      if (cambios.to !== undefined) {
        siguiente.set('hasta', cambios.to);
        siguiente.set('rango', 'personalizado');
      }

      if (cambios.categoryIds !== undefined) {
        if (cambios.categoryIds.length === 0) siguiente.delete('categorias');
        else siguiente.set('categorias', cambios.categoryIds.join(','));
      }
      if (cambios.q !== undefined) {
        if (cambios.q.trim() === '') siguiente.delete('busca');
        else siguiente.set('busca', cambios.q);
      }

      setParams(siguiente, { replace: true });
    },
    [params, setParams, porDefecto],
  );

  const limpiar = useCallback(
    () => setParams(new URLSearchParams(), { replace: true }),
    [setParams],
  );

  const hayFiltrosActivos =
    filtros.preset !== porDefecto || filtros.categoryIds.length > 0 || (filtros.q ?? '') !== '';

  return { filtros, aplicar, limpiar, hayFiltrosActivos };
}

/** Los filtros tal como los espera la API. */
export function aParametros(filtros: Filtros): {
  from: string;
  to: string;
  category_ids?: string;
  q?: string;
} {
  return {
    from: filtros.from,
    to: filtros.to,
    ...(filtros.categoryIds.length > 0 && { category_ids: filtros.categoryIds.join(',') }),
    ...(filtros.q && { q: filtros.q }),
  };
}
