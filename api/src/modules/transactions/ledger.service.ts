import { Injectable } from '@nestjs/common';

import { LedgerRepository } from './ledger.repository';
import type {
  AutoCharge,
  DuplicateCandidateRow,
  DuplicateCriteria,
  EnrichChanges,
  MonthlyHistory,
  SummaryFilter,
  SummaryMovement,
} from './ledger.types';
import type { Money } from '../../common/money/money';

export type {
  AutoCharge,
  DuplicateCandidateRow,
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
  constructor(private readonly repository: LedgerRepository) {}

  findIdByExternalRef(userId: bigint, externalRef: string): Promise<bigint | null> {
    return this.repository.findIdByExternalRef(userId, externalRef);
  }

  enrich(id: bigint, changes: EnrichChanges): Promise<void> {
    return this.repository.enrich(id, changes);
  }

  findDuplicateCandidates(criteria: DuplicateCriteria): Promise<DuplicateCandidateRow[]> {
    return this.repository.findDuplicateCandidates(criteria);
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
    before: Date,
  ): Promise<MonthlyHistory> {
    return this.repository.monthlyHistory(userId, categoryIds, before);
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
