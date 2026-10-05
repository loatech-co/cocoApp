import { Injectable } from '@nestjs/common';

import { CategoryLookupRepository } from './category-lookup.repository';
import type {
  AutoPaidConcept,
  ChosenCategory,
  SearchableCategory,
  SummaryCategory,
} from './category-lookup.types';

export type {
  AutoPaidConcept,
  ChosenCategory,
  SearchableCategory,
  SummaryCategory,
} from './category-lookup.types';

/**
 * What other modules may read about categories. The categories table belongs
 * to this module; categorization, interpretation and the dashboard read it
 * through here, never with a query of their own (CONTRIBUTING.md).
 */
@Injectable()
export class CategoryLookupService {
  constructor(private readonly repository: CategoryLookupRepository) {}

  isOwn(userId: bigint, categoryId: bigint): Promise<boolean> {
    return this.repository.isOwn(userId, categoryId);
  }

  findChosen(userId: bigint, id: bigint): Promise<ChosenCategory | null> {
    return this.repository.findChosen(userId, id);
  }

  findSearchable(userId: bigint): Promise<SearchableCategory[]> {
    return this.repository.findSearchable(userId);
  }

  findForSummary(userId: bigint): Promise<SummaryCategory[]> {
    return this.repository.findForSummary(userId);
  }

  findAutoPaid(userId: bigint): Promise<AutoPaidConcept[]> {
    return this.repository.findAutoPaid(userId);
  }

  ownersOfAutoPaid(): Promise<bigint[]> {
    return this.repository.ownersOfAutoPaid();
  }
}
