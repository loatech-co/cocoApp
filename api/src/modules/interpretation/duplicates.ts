/**
 * The same money, twice: Wallet and the bank's SMS.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * An Apple Pay payment produces TWO captures: the Wallet transaction, which
 * the app sends at once, and the bank's SMS, which arrives seconds or minutes
 * later. They are the same expense. With both recorded, the month costs
 * double.
 *
 * ── What is done ────────────────────────────────────────────────────────────
 * A capture from `wallet` or `sms` looks for an expense of the same person
 * with the same amount, the same date and ANOTHER source, captured within a
 * short window. If it is there, nothing new is created and nothing is
 * deleted: the existing one is enriched with what it lacks —the SMS brings
 * the text; Wallet, the merchant—. If the match is partial —same amount, but
 * another date or outside the window— it is created, but flagged for review:
 * neither lost nor taken as good.
 *
 * ── The window: ten minutes ─────────────────────────────────────────────────
 * A Colombian bank's SMS arrives between seconds and a couple of minutes
 * after the payment; ten minutes covers a slow bank and an app that was in
 * the background. Any wider would start merging two equal purchases at the
 * same place —two $6.000 coffees half an hour apart—, which are not the same
 * money.
 *
 * It is a pure function: whoever has the database brings the candidates, and
 * this decides.
 */

import { toMoney } from '../../common/money/money';
import type { TransactionSource } from '../../generated/prisma/client';
import type {
  DuplicateCandidateRow,
  DuplicateCriteria,
  TwinVerdict,
} from '../transactions/ledger.service';

export const DUPLICATE_WINDOW_MS = 10 * 60_000;
/** How far a resemblance counts as partial and not as chance. */
const PARTIAL_WINDOW_MS = 24 * 60 * 60_000;

/** The sources that produce the other side of the same payment. */
export const DUPLICATING_SOURCES: ReadonlySet<string> = new Set(['wallet', 'sms']);

export interface KnownCapture {
  id: bigint;
  source: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Decimal as a string, as the database stores it. */
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
 * What the new capture adds to the existing one: only what is missing. What
 * was there is never overwritten, because it was the first thing known.
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
 * What the database is asked for: same person, same amount, another source,
 * ±1 day of date and within the partial capture window. The fine decision is
 * `decideDuplicate`'s.
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

/** The verdict, said the way the database writes it: merge into one, or create (flagged if partial). */
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
