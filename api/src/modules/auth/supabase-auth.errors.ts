/**
 * What GoTrue answers when the email is already registered.
 *
 * ── Why it lives apart from the service ──────────────────────────────────────
 * Because it is pure logic and it has to be testable. `supabase-auth.service.ts`
 * imports `jose`, which is ESM only, and Jest —which runs CommonJS— cannot
 * load it: importing the service from a test fails before the first check.
 * That is why this function was exported «to be testable» and went months
 * without a single test.
 *
 * It is the same device `pending.ts`, `categories.tree.ts` and
 * `common/env.ts` already use: what can be decided without network or
 * database lives in its own file, with no dependencies.
 */

/**
 * A property of GoTrue's body, as text, only if it really is one.
 *
 * The body arrives as `Record<string, unknown>`: any field can be an object.
 * `String()` on one returns «[object Object]», which was then compared
 * against error codes as if it were data — a string that says nothing and
 * never matches, but is not empty either, so it switched off the message
 * fallback.
 *
 * A number is accepted: old GoTrue versions send `code: 422`.
 */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

export function isDuplicateEmail(status: number, data: Record<string, unknown> | null): boolean {
  if (status === 409) return true;
  if (status !== 422 && status !== 400) return false;

  const code = (asText(data?.error_code) || asText(data?.code)).toLowerCase();
  if (code === 'email_exists' || code === 'user_already_exists') return true;

  // The text is only read when no code came: with a code, the code wins, and
  // a `msg` about something else cannot contradict it.
  if (code !== '' && code !== '422' && code !== '400') return false;

  const message = (asText(data?.msg) || asText(data?.message)).toLowerCase();
  return (
    message.includes('already been registered') ||
    message.includes('already registered') ||
    message.includes('already exists')
  );
}
