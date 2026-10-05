import { ApiProperty } from '@nestjs/swagger';

export const SUGGESTION_REASONS = ['history', 'rule', 'seeded_rule'] as const;

export class Suggestion {
  categoryId!: number;
  /** 0–100. */
  confidence!: number;
  @ApiProperty({ enum: SUGGESTION_REASONS })
  reason!: (typeof SUGGESTION_REASONS)[number];
}

export class Learning {
  /** Whether a rule was recorded. */
  learned!: boolean;
}
