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

import { toMoney } from '../../common/money/money';
import type { TransactionSource } from '../../generated/prisma/client';
import type {
  DuplicateCandidateRow,
  DuplicateCriteria,
  TwinVerdict,
} from '../transactions/ledger.service';

export const DUPLICATE_WINDOW_MS = 10 * 60_000;
/** Hasta dónde un parecido cuenta como parcial y no como casualidad. */
const PARTIAL_WINDOW_MS = 24 * 60 * 60_000;

/** Los orígenes que producen la otra cara de un mismo pago. */
export const DUPLICATING_SOURCES: ReadonlySet<string> = new Set(['wallet', 'sms']);

export interface KnownCapture {
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

export interface NewCapture {
  source: string;
  date: string;
  amount: string;
  capturedAt: Date;
  rawText: string | null;
  merchant: string | null;
  description: string | null;
}

export type DuplicateVerdict =
  | { kind: 'exact'; match: KnownCapture }
  | { kind: 'partial'; match: KnownCapture }
  | { kind: 'none' };

export function decideDuplicate(
  incoming: NewCapture,
  candidates: readonly KnownCapture[],
): DuplicateVerdict {
  if (!DUPLICATING_SOURCES.has(incoming.source)) return { kind: 'none' };

  const comparable = candidates
    .filter((c) => c.source !== incoming.source)
    .filter((c) => isSameAmount(c.amount, incoming.amount))
    .map((c) => ({
      c,
      distance: Math.abs((c.capturedAt ?? c.createdAt).getTime() - incoming.capturedAt.getTime()),
    }))
    .sort((a, b) => a.distance - b.distance);

  const exact = comparable.find(
    ({ c, distance }) => c.date === incoming.date && distance <= DUPLICATE_WINDOW_MS,
  );
  if (exact) return { kind: 'exact', match: exact.c };

  const partial = comparable.find(
    ({ c, distance }) =>
      (c.date === incoming.date && distance <= PARTIAL_WINDOW_MS) ||
      (daysBetween(c.date, incoming.date) <= 1 && distance <= DUPLICATE_WINDOW_MS),
  );
  if (partial) return { kind: 'partial', match: partial.c };

  return { kind: 'none' };
}

/**
 * Lo que la captura nueva le aporta a la que ya estaba: solo lo que falte.
 * Nunca se pisa lo que había, que fue lo primero que se supo.
 */
export function enrich(
  existing: KnownCapture,
  incoming: NewCapture,
): Partial<Pick<KnownCapture, 'rawText' | 'merchant' | 'description'>> {
  const changes: Partial<Pick<KnownCapture, 'rawText' | 'merchant' | 'description'>> = {};
  if (!existing.rawText && incoming.rawText) changes.rawText = incoming.rawText;
  if (!existing.merchant && incoming.merchant) changes.merchant = incoming.merchant;
  if (!existing.description && incoming.description) changes.description = incoming.description;
  return changes;
}

function isSameAmount(a: string, b: string): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / (24 * 60 * 60_000);
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * Lo que se le pide a la base: misma persona, mismo monto, otro origen, ±1 día
 * de fecha y dentro de la ventana parcial de captura. Lo fino lo decide
 * `decidirDuplicado`.
 */
export function twinCriteria(
  userId: bigint,
  source: TransactionSource,
  incoming: NewCapture,
): DuplicateCriteria {
  const day = new Date(incoming.date).getTime();
  const captured = incoming.capturedAt.getTime();
  return {
    userId,
    source,
    amount: toMoney(incoming.amount),
    days: { from: new Date(day - DAY_MS), to: new Date(day + DAY_MS) },
    window: {
      from: new Date(captured - PARTIAL_WINDOW_MS),
      to: new Date(captured + PARTIAL_WINDOW_MS),
    },
  };
}

/** El veredicto, dicho como lo escribe la base: fusionar en una, o crear (marcada si fue parcial). */
export function twinVerdict(
  incoming: NewCapture,
  rows: readonly DuplicateCandidateRow[],
): TwinVerdict {
  const verdict = decideDuplicate(incoming, rows.map(toKnownCapture));
  if (verdict.kind === 'exact') {
    return { kind: 'merge', id: verdict.match.id, changes: enrich(verdict.match, incoming) };
  }
  return { kind: 'new', flag: verdict.kind === 'partial' };
}

function toKnownCapture(row: DuplicateCandidateRow): KnownCapture {
  return {
    id: row.id,
    source: row.source,
    date: row.date.toISOString().slice(0, 10),
    amount: row.amount.toString(),
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
    rawText: row.rawText,
    merchant: row.merchant,
    description: row.description,
  };
}
