import type { Problem, ProblemFieldError } from './generated/model';

/** What the web needs from an API error. */
export interface ParsedProblem {
  code: string;
  message: string;
  details: ProblemFieldError[];
}

/**
 * Reads a v2 error: `application/problem+json` (RFC 9457).
 *
 * `code` is the stable one, one per business rule; `detail` is the sentence for
 * the person; `errors`, the fields that failed. If the body is not a problem
 * —a proxy outage, an HTML page—, the default message stays.
 */
export function readProblem(body: unknown, fallback: string): ParsedProblem {
  const problem = (typeof body === 'object' ? body : null) as Partial<Problem> | null;
  return {
    code: problem?.code ?? 'unknown_error',
    message: problem?.detail ?? fallback,
    details: problem?.errors ?? [],
  };
}
