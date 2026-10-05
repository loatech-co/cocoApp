import { CERO, type Money } from '../../common/money/money';
import type { Periodicidad } from '../../generated/prisma/client';

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
  // `= NaN` es lo que daría una parte ausente: el mismo resultado que antes.
  const [anio = NaN, mes = NaN] = iso.split('-').map(Number);
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
  const [anio = NaN, numeroDeMes = NaN] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(anio, numeroDeMes, 0)).getUTCDate();
  const dia = Math.min(diaDePago ?? ultimoDia, ultimoDia);

  return `${mes.slice(0, 7)}-${String(dia).padStart(2, '0')}`;
}

/** Los `cuantos` meses anteriores a `mes`, del más reciente al más viejo. */
export function mesesAnteriores(mes: string, cuantos = 3): string[] {
  const [anio = NaN, m = NaN] = mes.split('-').map(Number);
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

  const ultimo = [...porMes.keys()]
    .filter((m) => m < mes)
    .sort()
    .pop();
  return ultimo === undefined ? null : (porMes.get(ultimo) ?? null);
}

/**
 * Qué parte de la historia lee `estimadoDelMes` para estimar `mesEnCurso`
 * (`YYYY-MM-01`): desde el primer día del más viejo de sus `cuantos` meses
 * anteriores hasta el mes en curso, sin incluirlo. Lo que cae más atrás solo
 * importa como último mes con pago, y eso lo resuelve el repositorio.
 */
export function ventanaDeLaHistoria(
  mesEnCurso: string,
  cuantos = 3,
): { before: Date; since: Date } {
  const masViejo = mesesAnteriores(mesEnCurso.slice(0, 7), cuantos).at(-1) ?? mesEnCurso;
  return { before: new Date(mesEnCurso), since: new Date(`${masViejo.slice(0, 7)}-01`) };
}

/**
 * Cuánto se espera que cueste, mirando primero lo que se DIJO.
 *
 * ── El presupuesto del concepto manda ───────────────────────────────────────
 * Hay gastos cuyo valor se sabe y no se estima: un alquiler con contrato, una
 * mensualidad de colegio, una cuota fija. Para esos, promediar los tres meses
 * anteriores da una cifra peor que el dato —la arrastra hacia arriba el mes
 * que se pagó con recargo, o hacia abajo el que se pagó a medias— y encima
 * cambia sola de un mes a otro sin que nadie haya tocado nada.
 *
 * Puesto, se usa tal cual, todos los meses. Es la definición de tenerlo: si se
 * mezclara con el promedio, ya no sería el presupuesto sino una influencia.
 *
 * ── Vacío se sigue promediando ──────────────────────────────────────────────
 * Que es lo correcto para lo que de verdad varía: la luz, el mercado, la
 * gasolina. Ahí el mejor dato disponible es lo que costó últimamente.
 *
 * ── Y un presupuesto de CERO es un presupuesto ──────────────────────────────
 * No un hueco. Alguien que escribe 0 está diciendo «esto este año no cuesta»,
 * y caer al promedio le devolvería justo la cifra que quiso quitar. Por eso se
 * mira contra `null` y no por si es falso.
 */
export function esperadoDelMes(
  presupuesto: Money | null,
  porMes: ReadonlyMap<string, Money>,
  mes: string,
  cuantos = 3,
): Money | null {
  return presupuesto ?? estimadoDelMes(porMes, mes, cuantos);
}

/**
 * La huella de un cobro automático: un concepto, un mes, una vez.
 *
 * Va en `external_ref`, que tiene índice ÚNICO por usuario. El cobro se
 * comprueba antes de insertar, pero dos peticiones simultáneas —dos pestañas
 * abiertas— pueden pasar la comprobación a la vez y llegar las dos a insertar.
 * Con la huella, la segunda choca contra la base en vez de duplicar un gasto.
 */
export function huellaDelCobro(categoryId: bigint, mes: string): string {
  return `auto:${categoryId.toString()}:${mes.slice(0, 7)}`;
}

/**
 * ¿Toca cobrar esto solo, hoy?
 *
 * ── Tres condiciones, y las tres tienen que darse ───────────────────────────
 * 1. Que el concepto lo pida. Sin `pagoAutomatico` nada se cobra solo: quien
 *    no lo enciende quiere seguir registrando a mano, y adelantarnos sería
 *    escribirle movimientos que no pidió.
 * 2. Que ya haya VENCIDO. Un débito del día 20 no ha salido el día 3, y
 *    anotarlo antes es decir que la plata ya se fue cuando sigue ahí.
 * 3. Que haya una cifra. Sin presupuesto y sin historia no hay número que
 *    poner, y un cobro automático de cero sería una mentira escrita en la
 *    contabilidad. Eso se queda pendiente, que es lo honesto: hay algo que
 *    pagar y no sabemos cuánto.
 *
 * Lo que NO se comprueba aquí es si ya está pagado: eso lo sabe quien tiene
 * los movimientos del mes delante, y es su trabajo no llamarnos dos veces.
 */
export function tocaCobrarAutomatico({
  pagoAutomatico,
  vencimientoISO,
  hoyISO,
  esperado,
}: {
  pagoAutomatico: boolean;
  vencimientoISO: string;
  hoyISO: string;
  esperado: Money | null;
}): boolean {
  if (!pagoAutomatico) return false;
  if (esperado === null) return false;
  return vencimientoISO <= hoyISO;
}

/**
 * Cómo queda un concepto recurrente en el mes en curso: si sigue faltando, y
 * con cuánto entra en el presupuesto del mes.
 *
 * ── El fallo que arregla ────────────────────────────────────────────────────
 * Hasta ahora bastaba UN movimiento confirmado para que el concepto saliera de
 * la lista. Para casi todo está bien —el alquiler se paga una vez y ya está—,
 * pero no para lo que se cubre a pedazos: la primera ida al mercado sacaba
 * «Mercado» de pagos pendientes, y el resto del mes la única pantalla que
 * responde «¿qué me falta pagar?» contestaba que nada, con 320.000 pagados de
 * 1.200.000. La cifra no estaba mal en ningún sitio: estaba ausente justo
 * donde se preguntaba por ella.
 *
 * ── Qué cambia, y qué NO ────────────────────────────────────────────────────
 * Solo cambia para los conceptos MARCADOS, y solo cuando hay una cifra
 * esperada mayor que cero. Sin un total al que llegar no existe «lo que
 * falta»: un concepto marcado pero sin presupuesto ni historia se comporta
 * como siempre, porque la alternativa sería dejarlo pendiente para siempre
 * —nunca alcanzaría un total que no existe— y un pendiente que no se puede
 * saldar es ruido permanente en la lista.
 *
 * ── Por qué el presupuesto toma el MAYOR de los dos ─────────────────────────
 * La pregunta de esa tarjeta es «¿cuánta plata tengo que tener este mes?».
 * Mientras se va cubriendo, la respuesta es lo esperado: lo pagado es un
 * anticipo de eso, no algo que se sume aparte. Pero cuando lo pagado SUPERA lo
 * esperado —el mercado salió más caro— la respuesta pasa a ser lo pagado, que
 * ya es un hecho. Quedarse en lo esperado diría que el mes costó menos de lo
 * que costó, y sumar los dos lo contaría dos veces.
 */
export function comoQuedaElPendiente({
  variosPagos,
  hayPago,
  pagado,
  esperado,
}: {
  variosPagos: boolean;
  /**
   * Si hay algún movimiento confirmado, aunque sume cero.
   *
   * Se pregunta por la EXISTENCIA y no por `pagado > 0` a propósito: es como
   * se comportaba antes, y un movimiento de cero es alguien diciendo «esto
   * este mes no costó», que es una respuesta y no un vacío.
   */
  hayPago: boolean;
  pagado: Money;
  esperado: Money | null;
}): { sigueFaltando: boolean; alPresupuesto: Money } {
  if (variosPagos && esperado?.gt(CERO)) {
    return {
      sigueFaltando: pagado.lt(esperado),
      alPresupuesto: pagado.gt(esperado) ? pagado : esperado,
    };
  }

  // Lo de siempre: al primer movimiento confirmado deja de faltar, y el mes
  // cuenta lo que de verdad costó.
  if (hayPago) return { sigueFaltando: false, alPresupuesto: pagado };
  return { sigueFaltando: true, alPresupuesto: esperado ?? CERO };
}
