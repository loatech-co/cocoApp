import { isDuplicateEmail } from './supabase-auth.errors';

/**
 * What counts as «that email is already registered».
 *
 * It is the function that decides whether an access request is lost
 * SILENTLY. Returning `true` too often means answering «we got your request»
 * without creating anything: no row, no audit entry, nothing an admin could
 * approve. It already happened once, when any 422 was treated as a repeated
 * email and swallowed weak passwords and disabled sign-ups too.
 *
 * It is exported for exactly this, and until now it had no test.
 */
describe('Recognising an email that is already registered', () => {
  it('409 is a conflict and allows no other reading', () => {
    expect(isDuplicateEmail(409, null)).toBe(true);
  });

  it('recognises the code GoTrue sends', () => {
    expect(isDuplicateEmail(422, { error_code: 'email_exists' })).toBe(true);
    expect(isDuplicateEmail(422, { code: 'user_already_exists' })).toBe(true);
    expect(isDuplicateEmail(400, { error_code: 'EMAIL_EXISTS' })).toBe(true);
  });

  it('with a code, the code WINS over the text', () => {
    // A `msg` about something else cannot contradict an explicit code.
    expect(
      isDuplicateEmail(422, {
        error_code: 'weak_password',
        msg: 'already been registered',
      }),
    ).toBe(false);
  });

  it('falls back to the text only when no code came', () => {
    expect(
      isDuplicateEmail(422, { msg: 'A user with this email address has already been registered' }),
    ).toBe(true);
    expect(isDuplicateEmail(422, { message: 'Email already exists' })).toBe(true);
    expect(isDuplicateEmail(422, { msg: 'Password is too weak' })).toBe(false);
  });

  it('the NUMERIC code of old versions does not hide the text fallback', () => {
    // GoTrue used to send `code: 422` —the status itself— without
    // `error_code`. That is not an error code, so the text still decides.
    expect(isDuplicateEmail(422, { code: 422, msg: 'already registered' })).toBe(true);
    expect(isDuplicateEmail(422, { code: 422, msg: 'Signups not allowed' })).toBe(false);
  });

  it('a field that arrives as an object does not become a code', () => {
    // `String({})` gives «[object Object]»: a string that matches no code but
    // is NOT empty either, so it switched off the message fallback and a
    // really repeated email was answered with a 500.
    expect(
      isDuplicateEmail(422, {
        error_code: { detail: 'algo' },
        msg: 'already been registered',
      }),
    ).toBe(true);
  });

  it('anything other than 409, 422 or 400 is not a repeated email', () => {
    // A 500 or a 401 is something else, and treating them as repeated would
    // lose the request without a trace.
    expect(isDuplicateEmail(500, { msg: 'already been registered' })).toBe(false);
    expect(isDuplicateEmail(401, { error_code: 'email_exists' })).toBe(false);
  });
});
