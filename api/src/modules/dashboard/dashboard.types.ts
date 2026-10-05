import type { AccountView } from '../accounts/accounts.service';

export interface PagoPendientePayload {
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

export interface GastoPorCategoriaPayload {
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
