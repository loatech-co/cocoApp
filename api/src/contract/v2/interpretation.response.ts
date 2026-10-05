import { ApiProperty } from '@nestjs/swagger';

import { Transaction } from './transactions.response';

export const CERTAINTIES = ['high', 'medium', 'none'] as const;
export const CLASSIFICATION_SOURCES = ['history', 'keywords', 'signature', 'dictionary'] as const;

export class Candidate {
  id!: number;
  name!: string;
  /** Where it hangs, as the user reads it: `Center › Category › Concept`. */
  path!: string;
}

export class Classification {
  @ApiProperty({ enum: CERTAINTIES })
  certainty!: (typeof CERTAINTIES)[number];
  @ApiProperty({ enum: CLASSIFICATION_SOURCES, nullable: true })
  source!: (typeof CLASSIFICATION_SOURCES)[number] | null;
  conceptId!: number | null;
  categoryId!: number | null;
  name!: string | null;
  candidates!: Candidate[];
  /** Why, in Spanish: the client shows it as is. */
  reason!: string;
}

export class Interpretation {
  amount!: string | null;
  date!: string | null;
  merchant!: string | null;
  description!: string | null;
  classification!: Classification;
  needsReview!: boolean;
}

export class Capture {
  transaction!: Transaction;
  classification!: Classification;
  /** One line for the notification, in Spanish. */
  summary!: string;
  /** The `externalRef` was already captured: this is that transaction, unchanged. */
  isDuplicate!: boolean;
  /** Merged into the other side of the same payment instead of creating a new one. */
  isMerged!: boolean;
}
