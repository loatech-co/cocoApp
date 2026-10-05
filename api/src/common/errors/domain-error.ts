/**
 * The errors the application speaks (step 7.4).
 *
 * Services, repositories and tasks throw these, never a Nest `HttpException`:
 * they describe what went wrong in the domain ("that does not exist", "that
 * clashes with something that does"), and only `AllExceptionsFilter` decides
 * what that means on the wire. The wire format does not change:
 * `{ error: { code, message, details } }`, with the same status codes and the
 * same Spanish messages as before.
 *
 * Each subclass exists because some code path needs its status today. Add a
 * new one only when a new status is needed, and map it in
 * `DOMAIN_ERROR_STATUS` (the compiler asks for it).
 */

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
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'validation'
  | 'internal'
  | 'unavailable';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  /** Problems by field. Empty unless the caller can point at the field. */
  readonly details: readonly ErrorDetail[];

  constructor(message: string, details: readonly ErrorDetail[] = []) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

/** The request is malformed in a way no DTO could express (400). */
export class BadRequestError extends DomainError {
  readonly kind = 'bad_request';
}

/** Nobody is signed in, or the credentials are wrong (401). */
export class AuthenticationError extends DomainError {
  readonly kind = 'unauthenticated';
}

/** Signed in, but not allowed to do this (403). */
export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden';
}

/** The resource does not exist, or belongs to someone else (404). */
export class NotFoundError extends DomainError {
  readonly kind = 'not_found';
}

/** The request clashes with the current state of the data (409). */
export class ConflictError extends DomainError {
  readonly kind = 'conflict';
}

/** An uploaded file is bigger than allowed (413). */
export class PayloadTooLargeError extends DomainError {
  readonly kind = 'payload_too_large';
}

/** An uploaded file is of a type that cannot be handled (415). */
export class UnsupportedMediaTypeError extends DomainError {
  readonly kind = 'unsupported_media_type';
}

/** Well-formed, but it breaks a business rule (422). */
export class ValidationError extends DomainError {
  readonly kind = 'validation';
}

/** A dependency answered in a way the app cannot recover from (500). */
export class InternalError extends DomainError {
  readonly kind = 'internal';
}

/** Something the request needs is down right now; retrying may work (503). */
export class ServiceUnavailableError extends DomainError {
  readonly kind = 'unavailable';
}
