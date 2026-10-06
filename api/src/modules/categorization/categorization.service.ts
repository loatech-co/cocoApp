import { Injectable } from '@nestjs/common';

import {
  learnablePattern,
  suggestCategory,
  type HistoryEntry,
  type CategoryRule,
  type SuggestedCategory,
} from './categorization';
import { CategorizationRepository } from './categorization.repository';
import { normalizeDescription } from './description';
import { ValidationError } from '../../common/errors/domain-error';
import { SUGGESTION_REASON, type English } from '../../common/vocabulary';
import { CategoryLookupService } from '../categories/category-lookup.service';
import { LedgerService } from '../transactions/ledger.service';

/**
 * How many already categorized transactions are read to learn.
 *
 * Enough for someone's pattern to show, and far fewer than "the whole
 * history": loading ten thousand rows on every suggestion would be absurd, and
 * recent transactions describe better how they organize their finances TODAY.
 */
const HISTORY_SIZE = 400;

/**
 * Priority the default seeded rules are born with, against the ones the person
 * creates or confirms. The difference is not decorative: it decides who wins
 * when two rules match, and with what confidence the suggestion is shown.
 */
const SEEDED_PRIORITY = 0;
const LEARNED_PRIORITY = 10;

/** A suggested category, as the service hands it out (the domain). */
export interface Suggestion {
  categoryId: number;
  /** 0–100. */
  confidence: number;
  reason: English<typeof SUGGESTION_REASON>;
}

/** Whether confirming a classification left a rule behind. */
export interface Learning {
  learned: boolean;
}

@Injectable()
export class CategorizationService {
  constructor(
    private readonly repository: CategorizationRepository,
    private readonly ledger: LedgerService,
    private readonly categories: CategoryLookupService,
  ) {}

  /**
   * Suggests a category for a single description (the quick capture).
   *
   * For several descriptions at once —a whole import— use `loadContext` once
   * and `suggestCategory` per row: the history is read once instead of once
   * per row.
   */
  async suggestFor(userId: bigint, description: string): Promise<Suggestion | null> {
    const context = await this.loadContext(userId);
    return suggestionOf(suggestCategory(description, context));
  }

  /**
   * The suggestion for what is being typed in the quick capture, or `null`
   * when there is no text yet: suggesting wrong is worse than not suggesting.
   */
  async suggestForQuery(
    userId: bigint,
    description: string | undefined,
  ): Promise<Suggestion | null> {
    return description?.trim() ? this.suggestFor(userId, description) : null;
  }

  /**
   * Reads in one go everything categorizing needs.
   *
   * Split out on purpose: an import of forty rows must cost two queries, not
   * eighty.
   */
  async loadContext(userId: bigint): Promise<{
    history: HistoryEntry[];
    rules: CategoryRule[];
  }> {
    const [transactions, rules] = await Promise.all([
      this.ledger.findCategorizedHistory(userId, HISTORY_SIZE),
      this.repository.findRules(userId),
    ]);

    return {
      // The query's filter guarantees there are no nulls; `flatMap` proves it to
      // TypeScript without dropping anything.
      history: transactions.flatMap((transaction) =>
        transaction.categoryId === null
          ? []
          : [{ description: transaction.description, categoryId: transaction.categoryId }],
      ),
      rules: rules.map((rule) => ({
        ...rule,
        isSeeded: rule.priority === SEEDED_PRIORITY,
      })),
    };
  }

  /**
   * Records that a suggestion was accepted, creating or reinforcing a rule.
   *
   * It is what makes the system improve with use without asking anyone for
   * anything: the next import will hit more because this one was corrected.
   */
  async learnFrom(userId: bigint, description: string, categoryId: bigint): Promise<boolean> {
    const pattern = learnablePattern(description, normalizeDescription);
    if (!pattern) return false;

    await this.repository.upsertRule(userId, pattern, categoryId, LEARNED_PRIORITY);
    return true;
  }

  /**
   * The same, but from the form: it first checks the category is theirs.
   *
   * `learnFrom` trusts its caller because the import already validated its
   * rows. From the form comes a `category_id` written by the client, and
   * without this check someone could create a rule pointing at another
   * account's category —useless to them, but a row that should not exist—.
   */
  async learnFromForm(userId: bigint, description: string, categoryId: bigint): Promise<Learning> {
    if (!(await this.categories.isOwn(userId, categoryId)))
      throw new ValidationError('Esa categoría no existe en tu cuenta.', {
        code: 'category_not_owned',
      });

    return { learned: await this.learnFrom(userId, description, categoryId) };
  }
}

function suggestionOf(suggested: SuggestedCategory | null): Suggestion | null {
  return suggested
    ? {
        categoryId: Number(suggested.categoryId),
        confidence: suggested.confidence,
        reason: suggested.reason,
      }
    : null;
}
