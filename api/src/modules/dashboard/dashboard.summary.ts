/**
 * The pieces of the dashboard summary that need no database: the breakdown by
 * category, the trend, the month's pending payments and the account totals.
 * `DashboardService.resumen` reads the data and composes these.
 */
import {
  ancestorAtLevel,
  bucketOf,
  rangeBuckets,
  granularityFor,
  type FlatCategory,
} from './dashboard.aggregate';
import type { CategorySpend, PendingPayment, TrendPoint } from './dashboard.types';
import { pendingOutcome, expectedForMonth, isDueInMonth, dueDate } from './pending';
import { ZERO, serialize, toMoney, type Money } from '../../common/money/money';
import type { Account } from '../accounts/accounts.service';
import type { SummaryCategory } from '../categories/category-lookup.service';
import type { MonthlyHistory, SummaryMovement } from '../transactions/ledger.service';

/** One row of a breakdown level, before it gets a name. */
interface GroupedRow {
  id: bigint | null;
  total: Money;
  count: number;
}

type Grouped = Map<string, GroupedRow>;

/** The tree, indexed by id: positions and the data of each category. */
export interface Tree {
  byId: ReadonlyMap<string, FlatCategory>;
  dataById: ReadonlyMap<string, SummaryCategory>;
}

export function treeOf(categories: readonly SummaryCategory[]): Tree {
  return {
    byId: new Map(categories.map((c) => [c.id.toString(), { id: c.id, parentId: c.parentId }])),
    dataById: new Map(categories.map((c) => [c.id.toString(), c])),
  };
}

/**
 * Rango del mes en `America/Bogota` (UTC−5, sin horario de verano).
 *
 * Importa hacerlo explícito: si los límites se calcularan en UTC, un gasto del
 * 31 a las 8 p.m. hora de Bogotá caería en el mes siguiente y el usuario vería
 * su plata en el mes equivocado.
 */
export function defaultRange(from?: string, to?: string): { start: Date; end: Date } {
  const nowInBogota = new Date(Date.now() - 5 * 60 * 60 * 1000);

  // Por defecto: del 1 del mes en curso a hoy. Es el "mes hasta la fecha", que
  // responde la pregunta que uno se hace a diario —"¿cómo voy este mes?"— sin
  // mezclarla con días que todavía no ocurrieron.
  const start = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(Date.UTC(nowInBogota.getUTCFullYear(), nowInBogota.getUTCMonth(), 1));

  const end = to
    ? new Date(`${to}T00:00:00.000Z`)
    : new Date(
        Date.UTC(nowInBogota.getUTCFullYear(), nowInBogota.getUTCMonth(), nowInBogota.getUTCDate()),
      );

  return { start, end };
}

export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** En qué nivel está una categoría: 1 centro, 2 categoría, 3 concepto. */
function categoryDepth(byId: ReadonlyMap<string, FlatCategory>, id: bigint): number {
  let level = 0;
  let current: bigint | null = id;
  const visited = new Set<string>();

  while (current !== null) {
    const key = current.toString();
    if (visited.has(key)) break;
    visited.add(key);
    level += 1;
    current = byId.get(key)?.parentId ?? null;
  }

  return level;
}

// ── Desglose, subiendo cada movimiento al nivel que toca ────────────────────

function groupAtLevel(
  movements: readonly SummaryMovement[],
  byId: ReadonlyMap<string, FlatCategory>,
  level: number,
): Grouped {
  const accumulated: Grouped = new Map();

  for (const m of movements) {
    if (m.type !== 'expense') continue;

    // Con splits, cada parte puede ir a una categoría distinta.
    const parts =
      m.splits.length > 0
        ? m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) }))
        : [{ categoryId: m.categoryId, amount: toMoney(m.amount) }];

    for (const part of parts) {
      const target = ancestorAtLevel(byId, part.categoryId, level);
      const key = target?.toString() ?? 'sin';
      const current = accumulated.get(key) ?? { id: target, total: ZERO, count: 0 };
      accumulated.set(key, {
        id: target,
        total: current.total.plus(part.amount),
        count: current.count + 1,
      });
    }
  }

  return accumulated;
}

/** Un nivel agrupado, listo para salir: con nombre, de mayor a menor. */
function toRows(grouped: Grouped, dataById: ReadonlyMap<string, SummaryCategory>): CategorySpend[] {
  return [...grouped.values()]
    .map((row) => {
      const data = row.id === null ? undefined : dataById.get(row.id.toString());
      return {
        categoryId: row.id,
        name: data?.name ?? 'Sin clasificar',
        color: data?.color ?? null,
        icon: data?.icon ?? null,
        total: serialize(toMoney(row.total)),
        count: row.count,
      };
    })
    .sort((a, b) => Number(b.total) - Number(a.total));
}

/**
 * The breakdown one level below what is being looked at, going further down
 * while a level has a single row, plus the spending by cost center.
 */
export function breakdown(
  movements: readonly SummaryMovement[],
  tree: Tree,
  singleRequested: bigint | undefined,
): {
  byCategory: CategorySpend[];
  byCostCenter: CategorySpend[];
  shownLevel: number;
  parent: bigint | null;
} {
  // El desglose baja un nivel respecto de lo que se mira: sin filtro se
  // agrupa por centro; dentro de un centro, por categoría; dentro de una categoría,
  // por concepto. Dentro de un concepto ya no hay a dónde bajar.
  //
  // Con VARIAS categorías marcadas no hay un "dentro de" único: dos centros
  // distintos no comparten nivel inferior. Se baja un nivel solo cuando lo
  // marcado es una sola cosa; si no, se desglosa por centro, que es la
  // pregunta que sigue teniendo respuesta.
  const filteredLevel =
    singleRequested === undefined ? 0 : categoryDepth(tree.byId, singleRequested);
  const drilled = drillWhileSingleRow(
    (level) => groupAtLevel(movements, tree.byId, level),
    Math.min(filteredLevel + 1, 3),
    singleRequested ?? null,
  );

  return {
    byCategory: toRows(drilled.accumulated, tree.dataById),
    /*
      Fijos contra variables.

      Los nombres salen de los CENTROS, no de una lista escrita aquí: quien
      los llamó "Costos fijos" y "Costos variables" puede llamarlos mañana de
      otra forma, y el indicador tiene que seguir diciendo la verdad.

      Se recalcula el nivel 1 en vez de reutilizar `acumulado` porque ese ya
      pudo haber bajado: cuando solo un centro tiene gasto, sus filas son
      categorías, y ahí ya no hay con qué responder esta pregunta.
    */
    byCostCenter: toRows(groupAtLevel(movements, tree.byId, 1), tree.dataById),
    shownLevel: drilled.shownLevel,
    parent: drilled.parent,
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
function drillWhileSingleRow(
  groupAt: (level: number) => Grouped,
  startLevel: number,
  requested: bigint | null,
): { accumulated: Grouped; shownLevel: number; parent: bigint | null } {
  let shownLevel = startLevel;
  let accumulated = groupAt(shownLevel);
  // De quién son las filas que se acaban mostrando. Con un filtro puesto ya
  // se sabe; si no, lo dirá la fila única por la que se vaya bajando.
  let parent = requested;

  const singleRowOf = (rows: Grouped) => (rows.size === 1 ? [...rows.values()][0] : undefined);

  for (
    let single = singleRowOf(accumulated);
    shownLevel < 3 && single !== undefined && single.id !== null;
    single = singleRowOf(accumulated)
  ) {
    const below = groupAt(shownLevel + 1);
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
    const hasNamesBelow = [...below.values()].some((f) => f.id !== null);
    if (!hasNamesBelow) break;
    parent = single.id;
    shownLevel += 1;
    accumulated = below;
  }

  return { accumulated, shownLevel, parent };
}

// ── Tendencia ───────────────────────────────────────────────────────────────

export function trend(
  movements: readonly SummaryMovement[],
  start: Date,
  end: Date,
): { granularity: 'day' | 'month'; points: TrendPoint[] } {
  const granularity = granularityFor(start, end);
  const buckets = new Map(
    rangeBuckets(start, end, granularity).map((b) => [
      b,
      { expense: ZERO, income: ZERO, count: 0 },
    ]),
  );

  const keys = [...buckets.keys()];
  const firstBucket = keys[0];
  const lastBucket = keys[keys.length - 1];

  for (const m of movements) {
    // Las transferencias no son gasto ni ingreso: solo cambian de bolsillo.
    if (m.type === 'transfer') continue;

    // ── Por qué la fecha del cubo depende de la granularidad ──────────────
    // `period` es el MES al que pertenece el gasto, y como fecha siempre es
    // el día 1. En un eje de meses eso es exactamente lo que se quiere. En
    // un eje de DÍAS, en cambio, todos los movimientos de agosto caían el 1
    // de agosto: la línea daba un pico el primer día y quedaba plana el
    // resto, aunque los pagos fueran el 13 y el 25.
    const when = granularity === 'day' ? m.date : m.period;

    let bucket = bucketOf(when, granularity);

    if (!buckets.has(bucket)) {
      // El pago cayó fuera del eje: la factura de marzo pagada el 6 de abril
      // entra en el rango por su periodo, pero su día no existe en un eje de
      // marzo. Se arrima al extremo más cercano en vez de descartarse — si
      // se descartara, la línea sumaría menos que el total de arriba y las
      // dos cifras de la misma pantalla se contradirían.
      // Sin eje no hay extremo al que arrimarlo; abajo tampoco habría cubo.
      if (firstBucket === undefined || lastBucket === undefined) continue;
      bucket = bucketOf(when, granularity) < firstBucket ? firstBucket : lastBucket;
    }

    const current = buckets.get(bucket);
    if (!current) continue;
    const amount = toMoney(m.amount);
    current.count += 1;
    if (m.type === 'expense') current.expense = current.expense.plus(amount);
    else current.income = current.income.plus(amount);
  }

  const points = [...buckets.entries()].map(([bucket, v]) => ({
    bucket,
    expense: serialize(toMoney(v.expense)),
    income: serialize(toMoney(v.income)),
    net: serialize(toMoney(v.income.minus(v.expense))),
    count: v.count,
  }));
  return { granularity, points };
}

// ── Lo que falta pagar este mes ─────────────────────────────────────────────

/** A recurring concept that can be due: it has a periodicity. */
export type RecurringConcept = SummaryCategory & {
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
export function liveRecurring(categories: readonly SummaryCategory[]): RecurringConcept[] {
  return categories.filter(
    (c): c is RecurringConcept => c.isRecurring && c.periodicity !== null && !c.isArchived,
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
export function pendingThisMonth(
  recurring: readonly RecurringConcept[],
  data: { history: MonthlyHistory; paidThisMonth: ReadonlyMap<string, Money> },
  currentMonth: string,
  tree: Tree,
): { pending: PendingPayment[]; budget: Money } {
  const pending: PendingPayment[] = [];
  let budget = ZERO;

  for (const concept of recurring) {
    // Primero si toca este mes: un trimestral que no cae aquí no cuenta
    // para el presupuesto ni aparece como pendiente.
    if (!isDueInMonth(concept.periodicity, concept.paymentMonth, currentMonth)) continue;

    const key = concept.id.toString();
    const paid = data.paidThisMonth.get(key);

    // La MISMA cifra que se enseña en la lista de pendientes: si el
    // presupuesto se estimara de otra forma, las dos tarjetas de la misma
    // pantalla dirían cosas distintas de la misma plata.
    //
    // Y el presupuesto del concepto, cuando lo tiene, gana al promedio.
    // Ver `esperadoDelMes`.
    const expected = expectedForMonth(
      concept.budget === null ? null : toMoney(concept.budget),
      data.history.get(key) ?? new Map(),
      currentMonth.slice(0, 7),
    );

    // Si sigue faltando y con cuánto entra en el presupuesto lo decide una
    // sola función, porque las dos respuestas tienen que ser coherentes
    // entre sí: un concepto que sale de la lista por estar cubierto no
    // puede entrar al presupuesto por lo que se esperaba.
    const outcome = pendingOutcome({
      isMultiPayment: concept.isMultiPayment,
      hasPayment: paid !== undefined,
      paid: paid ?? ZERO,
      expected,
    });

    budget = budget.plus(outcome.towardBudget);
    if (!outcome.isStillDue) continue;

    pending.push(pendingPaymentOf(concept, expected, paid, currentMonth, tree));
  }

  // Por fecha: lo que vence antes es lo que hay que mirar antes.
  pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { pending, budget };
}

function pendingPaymentOf(
  concept: RecurringConcept,
  expected: Money | null,
  paid: Money | undefined,
  currentMonth: string,
  tree: Tree,
): PendingPayment {
  // El camino completo: "Alquiler" solo no dice de qué centro cuelga.
  // Y de paso queda a la vista la RAÍZ, que es el centro de costos: de
  // ella sale si esto es fijo o variable.
  const ancestors: string[] = [];
  let current = tree.byId.get(concept.id.toString());
  let root = concept.id.toString();
  while (current?.parentId) {
    const parent = tree.dataById.get(current.parentId.toString());
    if (!parent) break;
    ancestors.unshift(parent.name);
    root = current.parentId.toString();
    current = tree.byId.get(current.parentId.toString());
  }

  return {
    categoryId: concept.id,
    name: concept.name,
    path: ancestors.join(' · '),
    periodicity: concept.periodicity,
    dueDate: dueDate(currentMonth, concept.paymentDay),
    expectedAmount: expected === null ? null : serialize(toMoney(expected)),
    costCenterId: BigInt(root),
    costCenter: tree.dataById.get(root)?.name ?? '',
    // Siempre, también en los normales —donde es cero—, para que la
    // pantalla no tenga que preguntarse si el campo viene.
    paidAmount: serialize(paid ?? ZERO),
    isMultiPayment: concept.isMultiPayment,
  };
}

/** Assets (every non-credit account), debts (credit cards) and net worth. */
export function totalsOf(accounts: readonly Account[]): {
  assets: string;
  debts: string;
  netWorth: string;
} {
  const assets = accounts
    .filter((c) => c.type !== 'credit')
    .reduce((total, c) => total.plus(toMoney(c.balance)), ZERO);
  const debts = accounts
    .filter((c) => c.type === 'credit')
    .reduce((total, c) => total.plus(toMoney(c.balance)), ZERO);

  return {
    assets: serialize(toMoney(assets)),
    debts: serialize(toMoney(debts)),
    netWorth: serialize(toMoney(assets.minus(debts))),
  };
}
