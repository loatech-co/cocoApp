import { ApiProperty } from '@nestjs/swagger';

/**
 * The two halves every v1 response shares: the `{ data, meta }` envelope that
 * `TransformInterceptor` puts around a success, and the
 * `{ error: { code, message, details } }` that `AllExceptionsFilter` writes
 * for a failure.
 */

/** `meta` of a list returned whole. */
export class TotalMeta {
  /** How many items `data` holds. */
  total!: number;
}

/** `meta` of a list returned one page at a time. */
export class PageMeta {
  /** 1-based page number. */
  page!: number;
  per_page!: number;
  /** Items across every page. */
  total!: number;
}

export class ErrorDetailResponse {
  /** The input field at fault, when there is one. */
  field?: string;
  message!: string;
}

export class ErrorBody {
  @ApiProperty({
    description:
      'Stable, machine-readable kind: bad_request, unauthenticated, forbidden, not_found, ' +
      'conflict, duplicate, unprocessable, rate_limited, payload_too_large, ' +
      'unsupported_media_type, internal_error, unavailable…',
    example: 'not_found',
  })
  code!: string;

  /** Human-readable, in Spanish: the client may show it as is. */
  message!: string;

  details!: ErrorDetailResponse[];
}

export class ErrorResponse {
  error!: ErrorBody;
}
