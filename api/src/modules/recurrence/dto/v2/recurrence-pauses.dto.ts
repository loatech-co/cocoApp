import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, Matches, Min } from 'class-validator';

/** A month, `YYYY-MM`: the unit a pause is measured in (ADR 0036). */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_MESSAGE = 'El mes va en formato AAAA-MM.';

/** How many charges one confirmation may delete: twenty years of a monthly one. */
const MOST_CHARGES = 240;

export class PauseRenewalInput {
  /** The first paused month, `YYYY-MM`. It may be past or future. */
  @Matches(MONTH, { message: MONTH_MESSAGE })
  fromMonth!: string;
}

export class ResumeRenewalInput {
  /** The first month active again, `YYYY-MM`; it must come after the pause starts. */
  @Matches(MONTH, { message: MONTH_MESSAGE })
  resumeMonth!: string;
}

export class DiscardPausedChargesInput {
  /** The automatic charges the person confirmed, from the pause's list. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MOST_CHARGES)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  transactionIds!: number[];
}
