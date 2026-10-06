/**
 * The pieces of the dashboard summary that need no database: the breakdown by
 * category, the trend, the month's pending payments and the account totals.
 * `DashboardService.resumen` reads the data and composes these.
 */
import {
  ancestroEnNivel,
  cuboDe,
  cubosDelRango,
  granularidadPara,
  type CategoriaPlana,
} from './dashboard.aggregate';
import type { CategorySpend, PendingPayment, TrendPoint } from './dashboard.types';
import { comoQuedaElPendiente, esperadoDelMes, tocaEnElMes, vencimiento } from './pendientes';
import { CERO, serializar, toMoney, type Money } from '../../common/money/money';
import type { Account } from '../accounts/accounts.service';
import type { SummaryCategory } from '../categories/category-lookup.service';
import type { MonthlyHistory, SummaryMovement } from '../transactions/ledger.service';

/** One row of a breakdown level, before it gets a name. */
interface FilaAgrupada {
  id: bigint | null;
  total: Money;
  count: number;
}

type Agrupado = Map<string, FilaAgrupada>;

/** The tree, indexed by id: positions and the data of each category. */
export interface Arbol {
  porId: ReadonlyMap<string, CategoriaPlana>;
  datosDe: ReadonlyMap<string, SummaryCategory>;
}

export function arbolDe(categorias: readonly SummaryCategory[]): Arbol {
  return {
    porId: new Map(categorias.map((c) => [c.id.toString(), { id: c.id, parentId: c.parentId }])),
    datosDe: new Map(categorias.map((c) => [c.id.toString(), c])),
  };
}

/**
 * Rango del mes en `America/Bogota` (UTC−5, sin horario de verano).
 *
 * Importa hacerlo explícito: si los límites se calcularan en UTC, un gasto del
 * 31 a las 8 p.m. hora de Bogotá caería en el mes siguiente y el usuario vería
 * su plata en el mes equivocado.
 */
export function rangoPorDefecto(from?: string, to?: string): { inicio: Date; fin: Date } {
  const ahoraEnBogota = new Date(Date.now() - 5 * 60 * 60 * 1000);

  // Por defecto: del 1 del mes en curso a hoy. Es el "mes hasta la fecha", que
  // responde la pregunta que uno se hace a diario —"¿cómo voy este mes?"— sin
  // mezclarla con días que todavía no ocurrieron.
  const inicio = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(Date.UTC(ahoraEnBogota.getUTCFullYear(), ahoraEnBogota.getUTCMonth(), 1));

  const fin = to
    ? new Date(`${to}T00:00:00.000Z`)
    : new Date(
        Date.UTC(
          ahoraEnBogota.getUTCFullYear(),
          ahoraEnBogota.getUTCMonth(),
          ahoraEnBogota.getUTCDate(),
        ),
      );

  return { inicio, fin };
}

export const aISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/** En qué nivel está una categoría: 1 centro, 2 categoría, 3 concepto. */
function profundidadDeCategoria(porId: ReadonlyMap<string, CategoriaPlana>, id: bigint): number {
  let nivel = 0;
  let actual: bigint | null = id;
  const visitados = new Set<string>();

  while (actual !== null) {
    const clave = actual.toString();
    if (visitados.has(clave)) break;
    visitados.add(clave);
    nivel += 1;
    actual = porId.get(clave)?.parentId ?? null;
  }

  return nivel;
}

// ── Desglose, subiendo cada movimiento al nivel que toca ────────────────────

function agrupar(
  movimientos: readonly SummaryMovement[],
  porId: ReadonlyMap<string, CategoriaPlana>,
  nivel: number,
): Agrupado {
  const acumulado: Agrupado = new Map();

  for (const m of movimientos) {
    if (m.type !== 'expense') continue;

    // Con splits, cada parte puede ir a una categoría distinta.
    const partes =
      m.splits.length > 0
        ? m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) }))
        : [{ categoryId: m.categoryId, amount: toMoney(m.amount) }];

    for (const parte of partes) {
      const destino = ancestroEnNivel(porId, parte.categoryId, nivel);
      const clave = destino?.toString() ?? 'sin';
      const actual = acumulado.get(clave) ?? { id: destino, total: CERO, count: 0 };
      acumulado.set(clave, {
        id: destino,
        total: actual.total.plus(parte.amount),
        count: actual.count + 1,
      });
    }
  }

  return acumulado;
}

/** Un nivel agrupado, listo para salir: con nombre, de mayor a menor. */
function aFilas(
  agrupado: Agrupado,
  datosDe: ReadonlyMap<string, SummaryCategory>,
): CategorySpend[] {
  return [...agrupado.values()]
    .map((fila) => {
      const datos = fila.id === null ? undefined : datosDe.get(fila.id.toString());
      return {
        categoryId: fila.id,
        name: datos?.name ?? 'Sin clasificar',
        color: datos?.color ?? null,
        icon: datos?.icon ?? null,
        total: serializar(toMoney(fila.total)),
        count: fila.count,
      };
    })
    .sort((a, b) => Number(b.total) - Number(a.total));
}

/**
 * The breakdown one level below what is being looked at, going further down
 * while a level has a single row, plus the spending by cost center.
 */
export function desglose(
  movimientos: readonly SummaryMovement[],
  arbol: Arbol,
  unicaPedida: bigint | undefined,
): {
  porCategoria: CategorySpend[];
  porCentro: CategorySpend[];
  nivelMostrado: number;
  padre: bigint | null;
} {
  // El desglose baja un nivel respecto de lo que se mira: sin filtro se
  // agrupa por centro; dentro de un centro, por categoría; dentro de una categoría,
  // por concepto. Dentro de un concepto ya no hay a dónde bajar.
  //
  // Con VARIAS categorías marcadas no hay un "dentro de" único: dos centros
  // distintos no comparten nivel inferior. Se baja un nivel solo cuando lo
  // marcado es una sola cosa; si no, se desglosa por centro, que es la
  // pregunta que sigue teniendo respuesta.
  const nivelFiltrado =
    unicaPedida === undefined ? 0 : profundidadDeCategoria(arbol.porId, unicaPedida);
  const bajado = bajarMientrasHayaUnaFila(
    (nivel) => agrupar(movimientos, arbol.porId, nivel),
    Math.min(nivelFiltrado + 1, 3),
    unicaPedida ?? null,
  );

  return {
    porCategoria: aFilas(bajado.acumulado, arbol.datosDe),
    /*
      Fijos contra variables.

      Los nombres salen de los CENTROS, no de una lista escrita aquí: quien
      los llamó "Costos fijos" y "Costos variables" puede llamarlos mañana de
      otra forma, y el indicador tiene que seguir diciendo la verdad.

      Se recalcula el nivel 1 en vez de reutilizar `acumulado` porque ese ya
      pudo haber bajado: cuando solo un centro tiene gasto, sus filas son
      categorías, y ahí ya no hay con qué responder esta pregunta.
    */
    porCentro: aFilas(agrupar(movimientos, arbol.porId, 1), arbol.datosDe),
    nivelMostrado: bajado.nivelMostrado,
    padre: bajado.padre,
  };
}

/*
  ── Si en este nivel solo hay UNA fila, se baja al siguiente ─────────────

  Un desglose de una sola fila no desglosa nada: dice "el 100 % de tu plata
  está en el único sitio donde puede estar". Pasa todo el tiempo al empezar,
  cuando existe un solo centro de costos, y también al filtrar por uno.

  Se sigue bajando mientras la respuesta siga siendo una sola fila, hasta
  llegar a los conceptos, que es donde ya no hay más abajo.
*/
function bajarMientrasHayaUnaFila(
  agruparEn: (nivel: number) => Agrupado,
  nivelDesglose: number,
  pedida: bigint | null,
): { acumulado: Agrupado; nivelMostrado: number; padre: bigint | null } {
  let nivelMostrado = nivelDesglose;
  let acumulado = agruparEn(nivelMostrado);
  // De quién son las filas que se acaban mostrando. Con un filtro puesto ya
  // se sabe; si no, lo dirá la fila única por la que se vaya bajando.
  let padre = pedida;

  const filaUnicaDe = (filas: Agrupado) => (filas.size === 1 ? [...filas.values()][0] : undefined);

  for (
    let unica = filaUnicaDe(acumulado);
    nivelMostrado < 3 && unica !== undefined && unica.id !== null;
    unica = filaUnicaDe(acumulado)
  ) {
    const masAbajo = agruparEn(nivelMostrado + 1);
    /*
      Se baja aunque abajo también haya UNA sola fila.

      Antes se frenaba cuando el nivel de abajo no tenía más filas que el de
      arriba, y eso dejaba clavado justo el caso más común: un solo centro de
      costos con un solo categoría se quedaba enseñando el centro, que es la fila
      que no dice nada. "Costos fijos, 100 %" ya se sabía antes de mirar.

      El único motivo para no bajar es que abajo no haya ningún nombre: si
      todo lo de este centro está clasificado en el centro mismo y no en
      ninguno de sus categorías, bajar cambiaría un nombre de verdad por un
      "Sin clasificar" que informa menos.
    */
    const hayNombresAbajo = [...masAbajo.values()].some((f) => f.id !== null);
    if (!hayNombresAbajo) break;
    padre = unica.id;
    nivelMostrado += 1;
    acumulado = masAbajo;
  }

  return { acumulado, nivelMostrado, padre };
}

// ── Tendencia ───────────────────────────────────────────────────────────────

export function tendencia(
  movimientos: readonly SummaryMovement[],
  inicio: Date,
  fin: Date,
): { granularidad: 'dia' | 'mes'; puntos: TrendPoint[] } {
  const granularidad = granularidadPara(inicio, fin);
  const cubos = new Map(
    cubosDelRango(inicio, fin, granularidad).map((b) => [
      b,
      { expense: CERO, income: CERO, count: 0 },
    ]),
  );

  const llaves = [...cubos.keys()];
  const primerCubo = llaves[0];
  const ultimoCubo = llaves[llaves.length - 1];

  for (const m of movimientos) {
    // Las transferencias no son gasto ni ingreso: solo cambian de bolsillo.
    if (m.type === 'transfer') continue;

    // ── Por qué la fecha del cubo depende de la granularidad ──────────────
    // `period` es el MES al que pertenece el gasto, y como fecha siempre es
    // el día 1. En un eje de meses eso es exactamente lo que se quiere. En
    // un eje de DÍAS, en cambio, todos los movimientos de agosto caían el 1
    // de agosto: la línea daba un pico el primer día y quedaba plana el
    // resto, aunque los pagos fueran el 13 y el 25.
    const cuando = granularidad === 'dia' ? m.date : m.period;

    let cubo = cuboDe(cuando, granularidad);

    if (!cubos.has(cubo)) {
      // El pago cayó fuera del eje: la factura de marzo pagada el 6 de abril
      // entra en el rango por su periodo, pero su día no existe en un eje de
      // marzo. Se arrima al extremo más cercano en vez de descartarse — si
      // se descartara, la línea sumaría menos que el total de arriba y las
      // dos cifras de la misma pantalla se contradirían.
      // Sin eje no hay extremo al que arrimarlo; abajo tampoco habría cubo.
      if (primerCubo === undefined || ultimoCubo === undefined) continue;
      cubo = cuboDe(cuando, granularidad) < primerCubo ? primerCubo : ultimoCubo;
    }

    const actual = cubos.get(cubo);
    if (!actual) continue;
    const monto = toMoney(m.amount);
    actual.count += 1;
    if (m.type === 'expense') actual.expense = actual.expense.plus(monto);
    else actual.income = actual.income.plus(monto);
  }

  const puntos = [...cubos.entries()].map(([bucket, v]) => ({
    bucket,
    expense: serializar(toMoney(v.expense)),
    income: serializar(toMoney(v.income)),
    net: serializar(toMoney(v.income.minus(v.expense))),
    count: v.count,
  }));
  return { granularidad, puntos };
}

// ── Lo que falta pagar este mes ─────────────────────────────────────────────

/** A recurring concept that can be due: it has a periodicity. */
export type Recurrente = SummaryCategory & {
  periodicity: NonNullable<SummaryCategory['periodicity']>;
};

/*
  Los ARCHIVADOS no entran aquí, y la palabra «aquí» es toda la regla.

  Archivar un concepto es decir «esto ya no va a volver»: el gimnasio que
  se dio de baja, el seguro del carro que se vendió. Seguir pidiéndolo cada
  mes en pagos pendientes es pedir algo que nadie va a pagar nunca, y esa
  fila no se puede quitar de la lista más que desarchivando el concepto
  —que es lo contrario de lo que se quiso hacer—.

  Pero solo sale de ESTA lista y del presupuesto del mes. Lo que ese
  concepto costó los meses que estuvo vivo sigue contando en la dona, en
  los totales y en la tendencia: archivarlo mira hacia adelante y no
  reescribe lo que ya pasó. Por eso el filtro va aquí y no en la consulta
  de las categorías, que es de donde beben los históricos.
*/
export function recurrentesVivos(categorias: readonly SummaryCategory[]): Recurrente[] {
  return categorias.filter(
    (c): c is Recurrente => c.isRecurring && c.periodicity !== null && !c.isArchived,
  );
}

/*
  ── Lo que hace falta este mes ──────────────────────────────────────────
  La suma de TODOS los conceptos recurrentes que vencen este mes, estén
  pagados o no. La pregunta es "¿cuánta plata tengo que tener este mes?",
  y por eso cuenta lo ya pagado: un presupuesto que se encoge cada vez que
  uno paga algo no es un presupuesto, es el saldo pendiente —y eso ya lo
  dice la tarjeta de pagos pendientes, que sale de este mismo recorrido—.

  Lo pagado entra por lo que costó DE VERDAD este mes; lo que falta, por
  lo que costó la última vez, que es lo único que se sabe de antemano.
*/
export function pendientesDelMes(
  recurrentes: readonly Recurrente[],
  datos: { historiaDe: MonthlyHistory; pagadoEsteMes: ReadonlyMap<string, Money> },
  mesEnCurso: string,
  arbol: Arbol,
): { pendientes: PendingPayment[]; presupuesto: Money } {
  const pendientes: PendingPayment[] = [];
  let presupuesto = CERO;

  for (const concepto of recurrentes) {
    // Primero si toca este mes: un trimestral que no cae aquí no cuenta
    // para el presupuesto ni aparece como pendiente.
    if (!tocaEnElMes(concepto.periodicity, concepto.paymentMonth, mesEnCurso)) continue;

    const clave = concepto.id.toString();
    const pagado = datos.pagadoEsteMes.get(clave);

    // La MISMA cifra que se enseña en la lista de pendientes: si el
    // presupuesto se estimara de otra forma, las dos tarjetas de la misma
    // pantalla dirían cosas distintas de la misma plata.
    //
    // Y el presupuesto del concepto, cuando lo tiene, gana al promedio.
    // Ver `esperadoDelMes`.
    const esperado = esperadoDelMes(
      concepto.budget === null ? null : toMoney(concepto.budget),
      datos.historiaDe.get(clave) ?? new Map(),
      mesEnCurso.slice(0, 7),
    );

    // Si sigue faltando y con cuánto entra en el presupuesto lo decide una
    // sola función, porque las dos respuestas tienen que ser coherentes
    // entre sí: un concepto que sale de la lista por estar cubierto no
    // puede entrar al presupuesto por lo que se esperaba.
    const estado = comoQuedaElPendiente({
      variosPagos: concepto.isMultiPayment,
      hayPago: pagado !== undefined,
      pagado: pagado ?? CERO,
      esperado,
    });

    presupuesto = presupuesto.plus(estado.alPresupuesto);
    if (!estado.sigueFaltando) continue;

    pendientes.push(pendienteDe(concepto, esperado, pagado, mesEnCurso, arbol));
  }

  // Por fecha: lo que vence antes es lo que hay que mirar antes.
  pendientes.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { pendientes, presupuesto };
}

function pendienteDe(
  concepto: Recurrente,
  esperado: Money | null,
  pagado: Money | undefined,
  mesEnCurso: string,
  arbol: Arbol,
): PendingPayment {
  // El camino completo: "Alquiler" solo no dice de qué centro cuelga.
  // Y de paso queda a la vista la RAÍZ, que es el centro de costos: de
  // ella sale si esto es fijo o variable.
  const camino: string[] = [];
  let actual = arbol.porId.get(concepto.id.toString());
  let raiz = concepto.id.toString();
  while (actual?.parentId) {
    const padre = arbol.datosDe.get(actual.parentId.toString());
    if (!padre) break;
    camino.unshift(padre.name);
    raiz = actual.parentId.toString();
    actual = arbol.porId.get(actual.parentId.toString());
  }

  return {
    categoryId: concepto.id,
    name: concepto.name,
    path: camino.join(' · '),
    periodicity: concepto.periodicity,
    dueDate: vencimiento(mesEnCurso, concepto.paymentDay),
    expectedAmount: esperado === null ? null : serializar(toMoney(esperado)),
    costCenterId: BigInt(raiz),
    costCenter: arbol.datosDe.get(raiz)?.name ?? '',
    // Siempre, también en los normales —donde es cero—, para que la
    // pantalla no tenga que preguntarse si el campo viene.
    paidAmount: serializar(pagado ?? CERO),
    isMultiPayment: concepto.isMultiPayment,
  };
}

/** Assets (every non-credit account), debts (credit cards) and net worth. */
export function totalesDe(cuentas: readonly Account[]): {
  assets: string;
  debts: string;
  netWorth: string;
} {
  const activos = cuentas
    .filter((c) => c.type !== 'credit')
    .reduce((total, c) => total.plus(toMoney(c.balance)), CERO);
  const deudas = cuentas
    .filter((c) => c.type === 'credit')
    .reduce((total, c) => total.plus(toMoney(c.balance)), CERO);

  return {
    assets: serializar(toMoney(activos)),
    debts: serializar(toMoney(deudas)),
    netWorth: serializar(toMoney(activos.minus(deudas))),
  };
}
