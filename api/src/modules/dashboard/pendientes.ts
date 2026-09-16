import type { Periodicidad } from '@prisma/client';

import { CERO, type Money } from '../../common/money/money';

/** Cada cuántos meses vuelve cada periodicidad. */
const MESES_ENTRE_PAGOS: Record<Periodicidad, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/** `2026-09-01` → 24320. Meses absolutos, para restar sin pelear con años. */
export function mesAbsoluto(iso: string): number {
  const [anio, mes] = iso.split('-').map(Number);
  return anio * 12 + (mes - 1);
}

/**
 * Si un concepto recurrente toca en un mes dado.
 *
 * ── Por qué hace falta un mes de referencia ─────────────────────────────────
 * Porque "cada tres meses" no dice CUÁLES. Puede ser enero, abril, julio y
 * octubre, o febrero, mayo, agosto y noviembre: son ciclos distintos y el dato
 * que los separa es en qué mes cae uno de ellos.
 *
 * Antes se contaba desde el último pago, que parecía ahorrar el dato pero lo
 * hacía todo frágil: borrar o corregir un movimiento viejo corría el ciclo
 * entero hacia adelante o hacia atrás, y el concepto pasaba a vencer otro mes
 * sin que nadie hubiera tocado su configuración.
 *
 * Lo mensual no necesita referencia: toca todos los meses.
 */
export function tocaEnElMes(
  periodicidad: Periodicidad,
  mesDeReferencia: number | null,
  mes: string,
): boolean {
  if (periodicidad === 'mensual') return true;

  const cada = MESES_ENTRE_PAGOS[periodicidad];

  // Sin referencia se asume que toca: es un concepto marcado como recurrente
  // del que no hay registro este mes. Callarlo sería esconder justo lo que se
  // quiere ver.
  if (mesDeReferencia === null) return true;

  const distancia = mesAbsoluto(mes) - (mesDeReferencia - 1);
  return ((distancia % cada) + cada) % cada === 0;
}

/**
 * El día del mes en que vence, recortado a los meses cortos.
 *
 * Quien paga el 31 no deja de pagar en febrero: paga el 28. Sin este recorte
 * el vencimiento caería en un día que no existe y la fecha se desbordaría al
 * mes siguiente, que es peor que redondear.
 */
export function vencimiento(mes: string, diaDePago: number | null): string {
  const [anio, numeroDeMes] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(anio, numeroDeMes, 0)).getUTCDate();
  const dia = Math.min(diaDePago ?? ultimoDia, ultimoDia);

  return `${mes.slice(0, 7)}-${String(dia).padStart(2, '0')}`;
}

/** Los `cuantos` meses anteriores a `mes`, del más reciente al más viejo. */
export function mesesAnteriores(mes: string, cuantos = 3): string[] {
  const [anio, m] = mes.split('-').map(Number);
  return Array.from({ length: cuantos }, (_, i) =>
    new Date(Date.UTC(anio, m - 1 - (i + 1), 1)).toISOString().slice(0, 7),
  );
}

/**
 * Cuánto se espera que cueste un concepto recurrente.
 *
 * ── El promedio de los tres meses anteriores ────────────────────────────────
 * No lo que costó la última vez: un recibo de luz de un mes de vacaciones, o
 * uno con una recarga puntual, se convertía en la previsión de todos los meses
 * siguientes. Tres meses promedian el ruido sin llegar tan atrás como para
 * arrastrar precios viejos.
 *
 * ── Los meses SIN pago no cuentan como cero ─────────────────────────────────
 * Un concepto que se pagó dos de los tres meses cuesta lo que costó esas dos
 * veces, no dos tercios de eso. Contar el mes vacío como un cero abarataría la
 * previsión justo de lo que se paga salteado, que es lo que más sorprende.
 *
 * ── Y si en los tres meses no hay nada ──────────────────────────────────────
 * Se cae al último mes que sí tuvo pago. No es un caso raro: un concepto
 * ANUAL no tiene pagos en los tres meses anteriores casi nunca, y dejarlo sin
 * cifra sería peor que estimarlo con la única que existe.
 *
 * `porMes` lleva lo que costó cada mes —un mes con dos pagos trae la suma—, y
 * `mes` es el mes que se está estimando, en `YYYY-MM`.
 */
export function estimadoDelMes(
  porMes: ReadonlyMap<string, Money>,
  mes: string,
  cuantos = 3,
): Money | null {
  const ventana = mesesAnteriores(mes, cuantos)
    .map((m) => porMes.get(m))
    .filter((v): v is Money => v !== undefined);

  if (ventana.length > 0) {
    return ventana.reduce<Money>((total, v) => total.plus(v), CERO).dividedBy(ventana.length);
  }

  const ultimo = [...porMes.keys()].filter((m) => m < mes).sort().pop();
  return ultimo === undefined ? null : (porMes.get(ultimo) ?? null);
}
