import { ApiProperty } from '@nestjs/swagger';

import { PROBLEM_TYPE_BASE, PROBLEMS, type ProblemCode } from '../../common/errors/problem-codes';

/** One problem with one input field. */
export class ProblemFieldError {
  /** Path of the field at fault (`splits.0.amount`), when there is one. */
  field?: string;
  /** In Spanish: the client may show it next to the field. */
  message!: string;
}

/**
 * A v2 error: `application/problem+json` (RFC 9457).
 *
 * Switch on `code`, never on `detail`: the code is stable and in English, the
 * sentence is for the person and may change.
 */
export class Problem {
  @ApiProperty({
    format: 'uri',
    description: `Identifies the kind of problem: \`${PROBLEM_TYPE_BASE}<code>\`.`,
    example: `${PROBLEM_TYPE_BASE}not_found`,
  })
  type!: string;

  /** Short summary of the kind of problem, in Spanish; the same for every occurrence. */
  title!: string;

  /** The HTTP status, repeated. */
  status!: number;

  /** What happened this time, in Spanish: the client may show it as is. */
  detail!: string;

  @ApiProperty({
    enum: Object.keys(PROBLEMS),
    description: 'Stable, machine-readable: one per business rule (`problem-codes.ts`).',
    example: 'not_found',
  })
  code!: ProblemCode;

  /** One per invalid field; present only when the input itself is at fault. */
  errors?: ProblemFieldError[];
}
