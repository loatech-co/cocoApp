import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CERO, serializar, toMoney } from '../../common/money/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsModule } from '../accounts/accounts.module';
import { AccountsService, type AccountView } from '../accounts/accounts.service';
import { idsDeCategorias, ramasDe } from '../categories/categories.tree';
import { PagosAutomaticosService } from './pagos-automaticos';
import { comoQuedaElPendiente, esperadoDelMes, tocaEnElMes, vencimiento } from './pendientes';
import {
  ancestroEnNivel,
  calcularFlujo,
  cuboDe,
  cubosDelRango,
  granularidadPara,
  type CategoriaPlana,
  type MovimientoAgregable,
} from './dashboard.aggregate';

/**
 * Los mismos filtros que la lista de movimientos, a propósito.
 *
 * El resumen y la lista son dos vistas del MISMO recorte: quien filtra por
 * "Servicios públicos" en el resumen y salta a movimientos espera ver esos
 * movimientos, no todos. Dos juegos de filtros distintos garantizarían que las
 * cifras de una pantalla no expliquen las de la otra.
 */
export class DashboardQueryDto {
  /** Inicio del rango, inclusive. Por defecto, el 1 del mes en curso. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha desde debe tener formato YYYY-MM-DD.' })
  from?: string;

  /** Fin del rango, inclusive. Por defecto, hoy. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha hasta debe tener formato YYYY-MM-DD.' })
  to?: string;

  /** Centro de costos, categoría o concepto. Incluye toda su rama. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  /** Varios, separados por coma. Cada uno arrastra su rama entera. */
  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/, {
    message: 'Las categorías deben ser números separados por coma.',
  })
  category_ids?: string;

  /** Busca en descripción, comercio y notas. Sin distinguir mayúsculas. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;
}

interface PagoPendientePayload {
  category_id: bigint;
  name: string;
  /** El camino hasta él, para saber de qué parte de la casa se habla. */
  path: string;
  periodicidad: string;
  /** `YYYY-MM-DD`. Ya recortado a los meses cortos. */
  due_date: string;
  /**
   * Lo que se espera que cueste: el promedio de los meses CON pago dentro de
   * los tres anteriores. `null` si nunca se ha pagado.
   */
  expected_amount: string | null;
  /**
   * El centro de costos del que cuelga, que es por lo que se filtra la lista.
   *
   * Va el `id` además del nombre: el nombre es lo que se lee y el id es lo que
   * se compara. Renombrar un centro desde la pantalla de al lado no tiene por
   * qué desmarcar nada.
   */
  centro_id: bigint;
  centro: string;
  /**
   * Lo que YA se pagó de esto este mes, confirmado.
   *
   * Casi siempre «0»: un pendiente normal no tiene nada pagado, porque al
   * primer movimiento desaparece de la lista. Deja de serlo en un concepto que
   * se paga en varias veces, que es el caso para el que existe: ahí hay algo
   * pagado y algo que falta A LA VEZ, y la pantalla tiene que poder decir
   * «llevas 608.350 de 1.200.000».
   */
  paid_amount: string;
  /**
   * Si este se cubre a pedazos.
   *
   * No se deduce de `paid_amount > 0`: un concepto normal con un pago
   * confirmado no está en esta lista, y uno marcado en su primera ida tiene
   * cero pagado y sí lo está.
   */
  varios_pagos: boolean;
}

interface GastoPorCategoriaPayload {
  category_id: bigint | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: string;
  count: number;
}

export interface PuntoDeTendencia {
  /** `2025-03-14` o `2025-03`, según la granularidad. */
  bucket: string;
  expense: string;
  income: string;
  net: string;
  /** Cuántos movimientos hay detrás del punto. */
  count: number;
}

export interface DashboardPayload {
  period: { from: string; to: string; granularity: 'dia' | 'mes' };
  accounts: AccountView[];
  totals: {
    /** Suma de las cuentas de activo. */
    assets: string;
    /** Suma de lo adeudado en tarjetas. */
    debts: string;
    /** Activos − deudas. */
    net_worth: string;
  };
  /** Del RANGO filtrado, no del mes. */
  range: { income: string; expense: string; net: string; count: number };
  /**
   * Desglose un nivel POR DEBAJO de lo que se está mirando: sin filtro, por
   * centro de costos; dentro de un centro, por sus categorías; dentro de una categoría,
   * por sus conceptos. Es lo que permite ir bajando sin cambiar de pantalla.
   */
  by_category: GastoPorCategoriaPayload[];
  /**
   * El gasto del rango repartido por CENTRO DE COSTOS, siempre en el nivel de
   * arriba aunque `by_category` haya bajado.
   *
   * Son dos preguntas distintas: `by_category` es "¿en qué se fue?" y baja
   * hasta donde haga falta; esto es "¿de qué tipo era?", y ahí el nivel de
   * arriba —fijos contra variables— ES la respuesta.
   */
  expense_by_center: GastoPorCategoriaPayload[];
  breakdown_level: 'centro de costos' | 'categoría' | 'concepto';
  /**
   * De quién son las filas del desglose.
   *
   * `null` en el nivel más alto, donde las filas son los centros de costos y
   * no cuelgan de nadie. En cuanto se baja —porque se filtró por algo, o
   * porque arriba había una sola fila— es la categoría a la que pertenecen
   * todas, y es lo único que explica por qué se está viendo ese nivel.
   */
  breakdown_parent: { id: bigint; name: string } | null;
  /**
   * Lo que hace falta este mes para los costos fijos: la suma de TODOS los
   * conceptos recurrentes que vencen en el mes, pagados o no.
   *
   * Del mes en curso, como `pending`, y no del rango filtrado: es una
   * pregunta sobre lo que viene, no sobre lo que se está revisando.
   */
  required_budget: string;
  /** Lo que se espera pagar este mes y todavía no aparece. */
  pending: PagoPendientePayload[];
  trend: PuntoDeTendencia[];
}

/**
 * Rango del mes en `America/Bogota` (UTC−5, sin horario de verano).
 *
 * Importa hacerlo explícito: si los límites se calcularan en UTC, un gasto del
 * 31 a las 8 p.m. hora de Bogotá caería en el mes siguiente y el usuario vería
 * su plata en el mes equivocado.
 */
function rangoPorDefecto(from?: string, to?: string): { inicio: Date; fin: Date } {
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

const aISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly automaticos: PagosAutomaticosService,
  ) {}

  async resumen(userId: bigint, query: DashboardQueryDto): Promise<DashboardPayload> {
    const { inicio, fin } = rangoPorDefecto(query.from, query.to);

    /*
      ── Antes de leer nada: cobrar lo que se cobra solo ───────────────────
      Los conceptos con pago automático crean su movimiento al llegar su día,
      y esto es lo que lo dispara: no hay planificador en esta aplicación, y
      el momento en que eso importa es justo este —alguien abriendo su mes—.

      Va PRIMERO a propósito. Si corriera después, o a mitad, el resumen
      tendría que adivinar qué acaba de escribirse para no contarlo dos veces
      ni dejarlo fuera. Cobrando antes, todo lo que sigue lee la base ya
      completa y no se entera de nada: lo recién cobrado se cuenta igual que
      si lo hubiera registrado una persona, porque a estas alturas ya lo es.

      Quien no use la función no paga nada por esto: se va en la primera
      consulta al no encontrar ningún concepto marcado.
    */
    const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await this.automaticos.cobrarLoQueToque(userId, `${hoy.slice(0, 7)}-01`, hoy);

    const categorias = await this.prisma.category.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        parentId: true,
        recurrente: true,
        periodicidad: true,
        diaDePago: true,
        mesDePago: true,
        presupuesto: true,
        pagoAutomatico: true,
        variosPagos: true,
        isArchived: true,
      },
    });

    const planas: CategoriaPlana[] = categorias.map((c) => ({ id: c.id, parentId: c.parentId }));
    const porId = new Map(planas.map((c) => [c.id.toString(), c]));
    const datosDe = new Map(categorias.map((c) => [c.id.toString(), c]));

    // Filtrar por categorías trae TODA su rama: los movimientos cuelgan del
    // concepto, nunca del centro ni dla categoría.
    const pedidas = [
      ...(query.category_id !== undefined ? [BigInt(query.category_id)] : []),
      ...idsDeCategorias(query.category_ids),
    ];
    const rama = pedidas.length > 0 ? ramasDe(planas, pedidas) : null;

    // La búsqueda también entra por la clasificación: "servicios públicos" trae
    // todo lo que cuelga de esa categoría aunque ninguna fila lo diga en su texto.
    const porNombre = query.q
      ? (() => {
          const aguja = query.q.toLowerCase();
          const coinciden = categorias
            .filter((c) => c.name.toLowerCase().includes(aguja))
            .map((c) => c.id);
          return coinciden.length > 0 ? ramasDe(planas, coinciden) : [];
        })()
      : [];

    // El desglose baja un nivel respecto de lo que se mira: sin filtro se
    // agrupa por centro; dentro de un centro, por categoría; dentro de una categoría,
    // por concepto. Dentro de un concepto ya no hay a dónde bajar.
    //
    // Con VARIAS categorías marcadas no hay un "dentro de" único: dos centros
    // distintos no comparten nivel inferior. Se baja un nivel solo cuando lo
    // marcado es una sola cosa; si no, se desglosa por centro, que es la
    // pregunta que sigue teniendo respuesta.
    const nivelFiltrado =
      pedidas.length === 1 ? profundidadDeCategoria(porId, pedidas[0]) : 0;
    const nivelDesglose = Math.min(nivelFiltrado + 1, 3);

    const [cuentas, movimientos] = await Promise.all([
      this.accounts.listar(userId, false),
      this.prisma.transaction.findMany({
        where: {
          userId,
          // Por PERÍODO, no por fecha de pago: la factura de marzo pagada el
          // 6 de abril pertenece a marzo, y es en marzo donde uno la busca.
          period: { gte: inicio, lte: fin },
          ...(rama && { categoryId: { in: rama } }),
          ...(query.q && {
            OR: [
              { description: { contains: query.q, mode: 'insensitive' as const } },
              { merchant: { contains: query.q, mode: 'insensitive' as const } },
              { notes: { contains: query.q, mode: 'insensitive' as const } },
              ...(porNombre.length > 0 ? [{ categoryId: { in: porNombre } }] : []),
            ],
          }),
        },
        select: {
          date: true,
          period: true,
          type: true,
          amount: true,
          categoryId: true,
          splits: { select: { categoryId: true, amount: true } },
        },
      }),
    ]);

    const agregables: MovimientoAgregable[] = movimientos.map((m) => ({
      type: m.type,
      amount: toMoney(m.amount),
      categoryId: m.categoryId,
      splits: m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) })),
    }));

    const flujo = calcularFlujo(agregables);

    // ── Desglose, subiendo cada movimiento al nivel que toca ──────────────────
    const agrupar = (
      nivel: number,
    ): Map<string, { id: bigint | null; total: typeof CERO; count: number }> => {
      const acumulado = new Map<string, { id: bigint | null; total: typeof CERO; count: number }>();

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
    };

    /*
      ── Si en este nivel solo hay UNA fila, se baja al siguiente ─────────────

      Un desglose de una sola fila no desglosa nada: dice "el 100 % de tu plata
      está en el único sitio donde puede estar". Pasa todo el tiempo al empezar,
      cuando existe un solo centro de costos, y también al filtrar por uno.

      Se sigue bajando mientras la respuesta siga siendo una sola fila, hasta
      llegar a los conceptos, que es donde ya no hay más abajo.
    */
    let nivelMostrado = nivelDesglose;
    let acumulado = agrupar(nivelMostrado);
    // De quién son las filas que se acaban mostrando. Con un filtro puesto ya
    // se sabe; si no, lo dirá la fila única por la que se vaya bajando.
    let padre: bigint | null = pedidas.length === 1 ? pedidas[0] : null;

    while (
      nivelMostrado < 3 &&
      acumulado.size === 1 &&
      [...acumulado.values()][0].id !== null
    ) {
      const masAbajo = agrupar(nivelMostrado + 1);
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
      padre = [...acumulado.values()][0].id;
      nivelMostrado += 1;
      acumulado = masAbajo;
    }

    const datosDelPadre = padre === null ? undefined : datosDe.get(padre.toString());

    /** Un nivel agrupado, listo para salir: con nombre, de mayor a menor. */
    const aFilas = (
      agrupado: ReturnType<typeof agrupar>,
    ): GastoPorCategoriaPayload[] =>
      [...agrupado.values()]
        .map((fila) => {
          const datos = fila.id === null ? undefined : datosDe.get(fila.id.toString());
          return {
            category_id: fila.id,
            name: datos?.name ?? 'Sin clasificar',
            color: datos?.color ?? null,
            icon: datos?.icon ?? null,
            total: serializar(toMoney(fila.total)),
            count: fila.count,
          };
        })
        .sort((a, b) => Number(b.total) - Number(a.total));

    const porCategoria = aFilas(acumulado);

    /*
      Fijos contra variables.

      Los nombres salen de los CENTROS, no de una lista escrita aquí: quien
      los llamó "Costos fijos" y "Costos variables" puede llamarlos mañana de
      otra forma, y el indicador tiene que seguir diciendo la verdad.

      Se recalcula el nivel 1 en vez de reutilizar `acumulado` porque ese ya
      pudo haber bajado: cuando solo un centro tiene gasto, sus filas son
      categorías, y ahí ya no hay con qué responder esta pregunta.
    */
    const porCentro = aFilas(agrupar(1));

    // ── Tendencia ─────────────────────────────────────────────────────────────
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
        cubo = cuboDe(cuando, granularidad) < primerCubo ? primerCubo : ultimoCubo;
      }

      const actual = cubos.get(cubo);
      if (!actual) continue;
      const monto = toMoney(m.amount);
      actual.count += 1;
      if (m.type === 'expense') actual.expense = actual.expense.plus(monto);
      else actual.income = actual.income.plus(monto);
    }

    const tendencia: PuntoDeTendencia[] = [...cubos.entries()].map(([bucket, v]) => ({
      bucket,
      expense: serializar(toMoney(v.expense)),
      income: serializar(toMoney(v.income)),
      net: serializar(toMoney(v.income.minus(v.expense))),
      count: v.count,
    }));

    // ── Lo que falta pagar este mes ───────────────────────────────────────
    // Del mes EN CURSO, no del rango que se esté mirando: la pregunta "¿qué me
    // falta pagar?" es siempre sobre hoy, aunque uno esté revisando 2024.
    const mesEnCurso = `${new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 7)}-01`;

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
      reescribe lo que ya pasó. Por eso el filtro va en esta línea y no en la
      consulta de arriba, que es de donde beben los históricos.
    */
    const recurrentes = categorias.filter(
      (c) => c.recurrente && c.periodicidad !== null && !c.isArchived,
    );
    const pendientes: PagoPendientePayload[] = [];

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
    let presupuesto = CERO;

    if (recurrentes.length > 0) {
      // La historia de los recurrentes, mes a mes: de aquí sale lo que se
      // espera que cueste cada uno. Solo lo ANTERIOR a este mes; lo de este
      // mes es un hecho, no una previsión.
      const historia = await this.prisma.transaction.findMany({
        where: {
          userId,
          categoryId: { in: recurrentes.map((c) => c.id) },
          period: { lt: new Date(mesEnCurso) },
        },
        select: { categoryId: true, amount: true, period: true },
      });

      // Cuánto costó cada concepto en cada mes. Un mes con dos pagos suma los
      // dos: el mes costó lo que costó, no lo que costó uno de los recibos.
      const historiaDe = new Map<string, Map<string, typeof CERO>>();
      for (const t of historia) {
        const clave = t.categoryId?.toString();
        if (clave === undefined) continue;
        const mes = t.period.toISOString().slice(0, 7);
        const meses = historiaDe.get(clave) ?? new Map<string, typeof CERO>();
        meses.set(mes, (meses.get(mes) ?? CERO).plus(toMoney(t.amount)));
        historiaDe.set(clave, meses);
      }

      /*
        Lo ya pagado ESTE mes, y CONFIRMADO.

        `status: 'cleared'` no es un detalle: un movimiento en `pending` es uno
        que todavía no se sabe si ocurrió —una transferencia programada, un
        débito anunciado—. Sacar el concepto de la lista por un pago que no se
        ha confirmado es prometer que algo está resuelto cuando no lo está, y
        el mes se cierra con un recibo sin pagar que nadie volvió a mirar.

        Un pago pendiente es exactamente eso: algo que está en el presupuesto y
        NO tiene todavía un movimiento confirmado que lo respalde.
      */
      const pagadosEsteMes = await this.prisma.transaction.findMany({
        where: {
          userId,
          categoryId: { in: recurrentes.map((c) => c.id) },
          period: { gte: new Date(mesEnCurso), lte: new Date(mesEnCurso) },
          status: 'cleared',
        },
        select: { categoryId: true, amount: true },
      });

      // Se SUMA por concepto: un mismo recurrente puede haberse pagado en dos
      // partes, y contar solo una diría que el mes costó menos de lo que costó.
      const pagadoEsteMes = new Map<string, typeof CERO>();
      for (const t of pagadosEsteMes) {
        const clave = t.categoryId?.toString();
        if (clave === undefined) continue;
        pagadoEsteMes.set(clave, (pagadoEsteMes.get(clave) ?? CERO).plus(toMoney(t.amount)));
      }

      for (const concepto of recurrentes) {
        // Primero si toca este mes: un trimestral que no cae aquí no cuenta
        // para el presupuesto ni aparece como pendiente.
        if (!tocaEnElMes(concepto.periodicidad!, concepto.mesDePago, mesEnCurso)) continue;

        const clave = concepto.id.toString();
        const pagado = pagadoEsteMes.get(clave);

        // La MISMA cifra que se enseña en la lista de pendientes: si el
        // presupuesto se estimara de otra forma, las dos tarjetas de la misma
        // pantalla dirían cosas distintas de la misma plata.
        //
        // Y el presupuesto del concepto, cuando lo tiene, gana al promedio.
        // Ver `esperadoDelMes`.
        const esperado = esperadoDelMes(
          concepto.presupuesto === null ? null : toMoney(concepto.presupuesto),
          historiaDe.get(clave) ?? new Map(),
          mesEnCurso.slice(0, 7),
        );

        // Si sigue faltando y con cuánto entra en el presupuesto lo decide una
        // sola función, porque las dos respuestas tienen que ser coherentes
        // entre sí: un concepto que sale de la lista por estar cubierto no
        // puede entrar al presupuesto por lo que se esperaba.
        const estado = comoQuedaElPendiente({
          variosPagos: concepto.variosPagos,
          hayPago: pagado !== undefined,
          pagado: pagado ?? CERO,
          esperado,
        });

        presupuesto = presupuesto.plus(estado.alPresupuesto);
        if (!estado.sigueFaltando) continue;

        // El camino completo: "Alquiler" solo no dice de qué centro cuelga.
        // Y de paso queda a la vista la RAÍZ, que es el centro de costos: de
        // ella sale si esto es fijo o variable.
        const camino: string[] = [];
        let actual = porId.get(clave);
        let raiz = clave;
        while (actual?.parentId) {
          const padre = datosDe.get(actual.parentId.toString());
          if (!padre) break;
          camino.unshift(padre.name);
          raiz = actual.parentId.toString();
          actual = porId.get(actual.parentId.toString());
        }

        pendientes.push({
          category_id: concepto.id,
          name: concepto.name,
          path: camino.join(' · '),
          periodicidad: concepto.periodicidad!,
          due_date: vencimiento(mesEnCurso, concepto.diaDePago),
          expected_amount: esperado === null ? null : serializar(toMoney(esperado)),
          centro_id: BigInt(raiz),
          centro: datosDe.get(raiz)?.name ?? '',
          // Siempre, también en los normales —donde es cero—, para que la
          // pantalla no tenga que preguntarse si el campo viene.
          paid_amount: serializar(pagado ?? CERO),
          varios_pagos: concepto.variosPagos,
        });
      }

      // Por fecha: lo que vence antes es lo que hay que mirar antes.
      pendientes.sort((a, b) => a.due_date.localeCompare(b.due_date));
    }

    const activos = cuentas
      .filter((c) => c.type !== 'credit')
      .reduce((total, c) => total.plus(toMoney(c.balance)), CERO);
    const deudas = cuentas
      .filter((c) => c.type === 'credit')
      .reduce((total, c) => total.plus(toMoney(c.balance)), CERO);

    return {
      period: { from: aISO(inicio), to: aISO(fin), granularity: granularidad },
      accounts: cuentas,
      totals: {
        assets: serializar(toMoney(activos)),
        debts: serializar(toMoney(deudas)),
        net_worth: serializar(toMoney(activos.minus(deudas))),
      },
      range: {
        income: serializar(flujo.income),
        expense: serializar(flujo.expense),
        net: serializar(flujo.net),
        count: movimientos.length,
      },
      by_category: porCategoria,
      expense_by_center: porCentro,
      breakdown_level: (['centro de costos', 'categoría', 'concepto'] as const)[nivelMostrado - 1],
      breakdown_parent:
        padre !== null && datosDelPadre ? { id: padre, name: datosDelPadre.name } : null,
      required_budget: serializar(toMoney(presupuesto)),
      pending: pendientes,
      trend: tendencia,
    };
  }
}

/** En qué nivel está una categoría: 1 centro, 2 categoría, 3 concepto. */
function profundidadDeCategoria(
  porId: ReadonlyMap<string, CategoriaPlana>,
  id: bigint,
): number {
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

/** M5 — Dashboard. Todo derivado; ninguna cifra se almacena. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  resumen(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardPayload> {
    return this.dashboard.resumen(user.id, query);
  }
}

@Module({
  imports: [AccountsModule],
  controllers: [DashboardController],
  providers: [DashboardService, PagosAutomaticosService],
})
export class DashboardModule {}
