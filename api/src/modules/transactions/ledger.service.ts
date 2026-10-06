import { Injectable } from '@nestjs/common';

import { CaptureRepository } from './capture.repository';
import { LedgerRepository } from './ledger.repository';
import type {
  AutoCharge,
  CaptureOutcome,
  DuplicateCandidateRow,
  DuplicateCriteria,
  MonthlyHistory,
  NewTransaction,
  SummaryFilter,
  SummaryMovement,
  TwinVerdict,
} from './ledger.types';
import type { Money } from '../../common/money/money';

export type {
  AutoCharge,
  DuplicateCandidateRow,
  DuplicateCriteria,
  NewTransaction,
  TwinVerdict,
  MonthlyHistory,
  SummaryFilter,
  SummaryMovement,
} from './ledger.types';

/**
 * What other modules may read and write in the transactions table, besides
 * the CRUD of `TransactionsService`. The table belongs to this module:
 * categorization, interpretation and the dashboard go through here, never
 * with a query of their own (CONTRIBUTING.md).
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly repository: LedgerRepository,
    private readonly captures: CaptureRepository,
  ) {}

  findIdByExternalRef(userId: bigint, externalRef: string): Promise<bigint | null> {
    return this.repository.findIdByExternalRef(userId, externalRef);
  }

  /** A Wallet or SMS capture: merged into its twin or written, under one lock. */
  createUnlessTwin(
    movement: NewTransaction,
    criteria: DuplicateCriteria,
    decide: (candidates: DuplicateCandidateRow[]) => TwinVerdict,
  ): Promise<CaptureOutcome> {
    return this.captures.createUnlessTwin(movement, criteria, decide);
  }

  findCategorizedHistory(
    userId: bigint,
    take: number,
  ): Promise<{ description: string | null; categoryId: bigint | null }[]> {
    return this.repository.findCategorizedHistory(userId, take);
  }

  findForSummary(userId: bigint, filter: SummaryFilter): Promise<SummaryMovement[]> {
    return this.repository.findForSummary(userId, filter);
  }

  monthlyHistory(
    userId: bigint,
    categoryIds: readonly bigint[],
    range: { before: Date; since: Date },
  ): Promise<MonthlyHistory> {
    return this.repository.monthlyHistory(userId, categoryIds, range);
  }

  clearedInMonth(
    userId: bigint,
    categoryIds: readonly bigint[],
    month: Date,
  ): Promise<Map<string, Money>> {
    return this.repository.clearedInMonth(userId, categoryIds, month);
  }

  categoriesWithMovementIn(
    userId: bigint,
    categoryIds: readonly bigint[],
    period: Date,
  ): Promise<Set<string | undefined>> {
    return this.repository.categoriesWithMovementIn(userId, categoryIds, period);
  }

  createAutoCharge(charge: AutoCharge): Promise<boolean> {
    return this.repository.createAutoCharge(charge);
  }
}
