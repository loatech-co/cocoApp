import { Injectable } from '@nestjs/common';

import { calcularFlujo, type MovimientoAgregable } from './dashboard.aggregate';
import type { DashboardQueryDto } from './dashboard.dto';
import {
  aISO,
  arbolDe,
  desglose,
  pendientesDelMes,
  rangoPorDefecto,
  recurrentesVivos,
  tendencia,
  totalesDe,
  type Arbol,
} from './dashboard.summary';
import type { DashboardPayload, PagoPendientePayload } from './dashboard.types';
import { idsDeCategorias, ramasDe } from '../../common/categories/categories.tree';
import { CERO, serializar, toMoney, type Money } from '../../common/money/money';
import { AccountsService } from '../accounts/accounts.service';
import { CategoryLookupService, type SummaryCategory } from '../categories/category-lookup.service';
import { LedgerService, type SummaryMovement } from '../transactions/ledger.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly categories: CategoryLookupService,
    private readonly ledger: LedgerService,
    private readonly accounts: AccountsService,
  ) {}

  async resumen(userId: bigint, query: DashboardQueryDto): Promise<DashboardPayload> {
    const { inicio, fin } = rangoPorDefecto(query.from, query.to);

    // A GET only reads. Auto-paid concepts are charged by AutoChargeTask, once
    // a day and at start-up (phase 6.7), not on the way in here.

    const categorias = await this.categories.findForSummary(userId);
    const arbol = arbolDe(categorias);
    const planas = [...arbol.porId.values()];

    // Filtrar por categorías trae TODA su rama: los movimientos cuelgan del
    // concepto, nunca del centro ni dla categoría.
    const pedidas = [
      ...(query.category_id !== undefined ? [BigInt(query.category_id)] : []),
      ...idsDeCategorias(query.category_ids),
    ];

    const [cuentas, movimientos] = await Promise.all([
      this.accounts.listar(userId, false),
      this.ledger.findForSummary(userId, {
        from: inicio,
        to: fin,
        branch: pedidas.length > 0 ? ramasDe(planas, pedidas) : null,
        q: query.q,
        byName: query.q ? ramaPorNombre(categorias, query.q) : [],
      }),
    ]);

    const flujo = calcularFlujo(movimientos.map(agregable));

    const partes = desglose(movimientos, arbol, pedidas.length === 1 ? pedidas[0] : undefined);
    const datosDelPadre =
      partes.padre === null ? undefined : arbol.datosDe.get(partes.padre.toString());
    const { granularidad, puntos } = tendencia(movimientos, inicio, fin);
    const { pendientes, presupuesto } = await this.pendientes(userId, categorias, arbol);

    return {
      period: { from: aISO(inicio), to: aISO(fin), granularity: granularidad },
      accounts: cuentas,
      totals: totalesDe(cuentas),
      range: {
        income: serializar(flujo.income),
        expense: serializar(flujo.expense),
        net: serializar(flujo.net),
        count: movimientos.length,
      },
      by_category: partes.porCategoria,
      expense_by_center: partes.porCentro,
      // `nivelMostrado` va de 1 a 3: el respaldo nunca se usa.
      breakdown_level:
        (['centro de costos', 'categoría', 'concepto'] as const)[partes.nivelMostrado - 1] ??
        'concepto',
      breakdown_parent:
        partes.padre !== null && datosDelPadre
          ? { id: partes.padre, name: datosDelPadre.name }
          : null,
      required_budget: serializar(toMoney(presupuesto)),
      pending: pendientes,
      trend: puntos,
    };
  }

  /**
   * Lo que falta pagar este mes, y lo que hace falta para todo el mes.
   *
   * Del mes EN CURSO, no del rango que se esté mirando: la pregunta "¿qué me
   * falta pagar?" es siempre sobre hoy, aunque uno esté revisando 2024.
   */
  private async pendientes(
    userId: bigint,
    categorias: readonly SummaryCategory[],
    arbol: Arbol,
  ): Promise<{ pendientes: PagoPendientePayload[]; presupuesto: Money }> {
    const mesEnCurso = `${new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 7)}-01`;
    const recurrentes = recurrentesVivos(categorias);
    if (recurrentes.length === 0) return { pendientes: [], presupuesto: CERO };

    const ids = recurrentes.map((c) => c.id);
    // La historia de los recurrentes, mes a mes: de aquí sale lo que se
    // espera que cueste cada uno. Solo lo ANTERIOR a este mes; lo de este
    // mes es un hecho, no una previsión.
    const historiaDe = await this.ledger.monthlyHistory(userId, ids, new Date(mesEnCurso));
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
    const pagadoEsteMes = await this.ledger.clearedInMonth(userId, ids, new Date(mesEnCurso));

    return pendientesDelMes(recurrentes, { historiaDe, pagadoEsteMes }, mesEnCurso, arbol);
  }
}

/**
 * La búsqueda también entra por la clasificación: "servicios públicos" trae
 * todo lo que cuelga de esa categoría aunque ninguna fila lo diga en su texto.
 */
function ramaPorNombre(categorias: readonly SummaryCategory[], q: string): bigint[] {
  const aguja = q.toLowerCase();
  const coinciden = categorias.filter((c) => c.name.toLowerCase().includes(aguja)).map((c) => c.id);
  const planas = categorias.map((c) => ({ id: c.id, parentId: c.parentId }));
  return coinciden.length > 0 ? ramasDe(planas, coinciden) : [];
}

function agregable(m: SummaryMovement): MovimientoAgregable {
  return {
    type: m.type,
    amount: toMoney(m.amount),
    categoryId: m.categoryId,
    splits: m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) })),
  };
}
