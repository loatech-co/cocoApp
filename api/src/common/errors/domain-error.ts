/**
 * The errors the application speaks (step 7.4).
 *
 * Services, repositories and tasks throw these, never a Nest `HttpException`:
 * they describe what went wrong in the domain ("that does not exist", "that
 * clashes with something that does"), and only `AllExceptionsFilter` decides
 * what that means on the wire: `application/problem+json`.
 *
 * Each subclass exists because some code path needs its status today. Add a
 * new one only when a new status is needed, and map it in
 * `DOMAIN_ERROR_STATUS` (the compiler asks for it).
 *
 * A business rule a client may want to react to carries its own `code`
 * (`problem-codes.ts`), which v2 sends. Each subclass only takes the codes of
 * its own status, so a code cannot go out with a status its entry does not
 * declare.
 */

import type { PROBLEMS, ProblemCode } from './problem-codes';

/** One problem with one field, for forms that can point at it. */
export interface ErrorDetail {
  field?: string;
  message: string;
}

/** What kind of failure it is. The filter maps each one to an HTTP status. */
export type DomainErrorKind =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'duplicate'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'validation'
  | 'internal'
  | 'unavailable';

/** The codes that go out with HTTP status `S`. */
export type CodeWithStatus<S extends number> = {
  [K in ProblemCode]: (typeof PROBLEMS)[K]['status'] extends S ? K : never;
}[ProblemCode];

export interface DomainErrorOptions<C extends ProblemCode = ProblemCode> {
  /** The rule that was broken, when it has a code of its own. */
  code?: C;
  /** Problems by field. */
  details?: readonly ErrorDetail[];
}

/**
 * `S` is the HTTP status of the subclass: it only accepts the codes that go
 * out with that status.
 */
export abstract class DomainError<S extends number = number> extends Error {
  abstract readonly kind: DomainErrorKind;

  /** Problems by field. Empty unless the caller can point at the field. */
  readonly details: readonly ErrorDetail[];

  /** The specific rule; `undefined` falls back to the code of the kind. */
  readonly code: ProblemCode | undefined;

  constructor(message: string, options: DomainErrorOptions<CodeWithStatus<S>> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = options.details ?? [];
    this.code = options.code;
  }
}

/** The request is malformed in a way no DTO could express (400). */
export class BadRequestError extends DomainError<400> {
  readonly kind = 'bad_request';
}

/** Nobody is signed in, or the credentials are wrong (401). */
export class AuthenticationError extends DomainError<401> {
  readonly kind = 'unauthenticated';
}

/** Signed in, but not allowed to do this (403). */
export class ForbiddenError extends DomainError<403> {
  readonly kind = 'forbidden';
}

/** The resource does not exist, or belongs to someone else (404). */
export class NotFoundError extends DomainError<404> {
  readonly kind = 'not_found';
}

/** The request clashes with the current state of the data (409). */
export class ConflictError extends DomainError<409> {
  readonly kind = 'conflict';
}

/**
 * A unique key already holds this value (409, code `duplicate`). Thrown by a
 * repository when the database rejects an insert on a unique index, so that a
 * caller can treat "it is already there" as an answer and not as a failure.
 * Its message is the one an unhandled unique violation already had.
 */
export class DuplicateError extends DomainError<409> {
  readonly kind = 'duplicate';

  constructor(message = 'Ya existe un registro con esos datos.') {
    super(message, { code: 'duplicate' });
  }
}

/** An uploaded file is bigger than allowed (413). */
export class PayloadTooLargeError extends DomainError<413> {
  readonly kind = 'payload_too_large';
}

/** An uploaded file is of a type that cannot be handled (415). */
export class UnsupportedMediaTypeError extends DomainError<415> {
  readonly kind = 'unsupported_media_type';
}

/** Well-formed, but it breaks a business rule (422). */
export class ValidationError extends DomainError<422> {
  readonly kind = 'validation';
}

/** A dependency answered in a way the app cannot recover from (500). */
export class InternalError extends DomainError<500> {
  readonly kind = 'internal';
}

/** Something the request needs is down right now; retrying may work (503). */
export class ServiceUnavailableError extends DomainError<503> {
  readonly kind = 'unavailable';
}
