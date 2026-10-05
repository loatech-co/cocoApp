/**
 * La misma plata, dos veces: Wallet y el SMS del banco.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 * Un pago con Apple Pay produce DOS capturas: la transacción de Wallet, que
 * la app manda al instante, y el SMS del banco, que llega segundos o minutos
 * después. Son el mismo gasto. Registrados los dos, el mes cuesta el doble.
 *
 * ── Qué se hace ─────────────────────────────────────────────────────────────
 * Al capturar desde `wallet` o `sms` se busca un gasto de la misma persona
 * con el mismo monto, la misma fecha y OTRO origen, capturado dentro de una
 * ventana corta. Si está, no se crea otro ni se borra nada: se enriquece el
 * que había con lo que le falte —el SMS trae el texto; Wallet, el comercio—.
 * Si el parecido es parcial —mismo monto, pero otra fecha o fuera de la
 * ventana— se crea, pero marcado para revisar: ni se pierde ni se da por bueno.
 *
 * ── La ventana: diez minutos ────────────────────────────────────────────────
 * El SMS de un banco colombiano llega entre segundos y un par de minutos
 * después del pago; diez minutos cubre un banco lento y una app que estaba en
 * segundo plano. Más ancha empezaría a juntar dos compras iguales en el mismo
 * sitio —dos cafés de $6.000 con media hora de diferencia—, que no son la
 * misma plata.
 *
 * Es una función pura: quien tiene la base trae las candidatas, y esto decide.
 */
export const VENTANA_DE_DUPLICADO_MS = 10 * 60_000;
/** Hasta dónde un parecido cuenta como parcial y no como casualidad. */
export const VENTANA_PARCIAL_MS = 24 * 60 * 60_000;

/** Los orígenes que producen la otra cara de un mismo pago. */
export const ORIGENES_QUE_SE_DUPLICAN: ReadonlySet<string> = new Set(['wallet', 'sms']);

export interface CapturaConocida {
  id: bigint;
  source: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Decimal como cadena, tal como lo guarda la base. */
  amount: string;
  capturedAt: Date | null;
  createdAt: Date;
  rawText: string | null;
  merchant: string | null;
  description: string | null;
}

export interface CapturaNueva {
  source: string;
  date: string;
  amount: string;
  capturedAt: Date;
  rawText: string | null;
  merchant: string | null;
  description: string | null;
}

export type Veredicto =
  | { tipo: 'exacto'; con: CapturaConocida }
  | { tipo: 'parcial'; con: CapturaConocida }
  | { tipo: 'ninguno' };

export function decidirDuplicado(
  nueva: CapturaNueva,
  candidatas: readonly CapturaConocida[],
): Veredicto {
  if (!ORIGENES_QUE_SE_DUPLICAN.has(nueva.source)) return { tipo: 'ninguno' };

  const comparables = candidatas
    .filter((c) => c.source !== nueva.source)
    .filter((c) => mismoMonto(c.amount, nueva.amount))
    .map((c) => ({
      c,
      distancia: Math.abs((c.capturedAt ?? c.createdAt).getTime() - nueva.capturedAt.getTime()),
    }))
    .sort((a, b) => a.distancia - b.distancia);

  const exacto = comparables.find(
    ({ c, distancia }) => c.date === nueva.date && distancia <= VENTANA_DE_DUPLICADO_MS,
  );
  if (exacto) return { tipo: 'exacto', con: exacto.c };

  const parcial = comparables.find(
    ({ c, distancia }) =>
      (c.date === nueva.date && distancia <= VENTANA_PARCIAL_MS) ||
      (diasEntre(c.date, nueva.date) <= 1 && distancia <= VENTANA_DE_DUPLICADO_MS),
  );
  if (parcial) return { tipo: 'parcial', con: parcial.c };

  return { tipo: 'ninguno' };
}

/**
 * Lo que la captura nueva le aporta a la que ya estaba: solo lo que falte.
 * Nunca se pisa lo que había, que fue lo primero que se supo.
 */
export function enriquecer(
  existente: CapturaConocida,
  nueva: CapturaNueva,
): Partial<Pick<CapturaConocida, 'rawText' | 'merchant' | 'description'>> {
  const cambios: Partial<Pick<CapturaConocida, 'rawText' | 'merchant' | 'description'>> = {};
  if (!existente.rawText && nueva.rawText) cambios.rawText = nueva.rawText;
  if (!existente.merchant && nueva.merchant) cambios.merchant = nueva.merchant;
  if (!existente.description && nueva.description) cambios.description = nueva.description;
  return cambios;
}

function mismoMonto(a: string, b: string): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / (24 * 60 * 60_000);
}
