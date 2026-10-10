/**
 * Password policy.
 *
 * Pure logic with no dependencies so it can be tested exhaustively: it is the
 * only barrier between an account and whoever tries to guess it.
 *
 * A design note: NIST SP 800-63B advises against composition rules (requiring
 * an uppercase letter, a number and a symbol) because they push people toward
 * predictable variations like `P@ssw0rd1!`, which tick every box and are in
 * every attack dictionary. What does work is LENGTH and checking against
 * already-breached passwords.
 *
 * Both are applied here: the composition the product owner asked for (12
 * characters with upper and lower case, a number and a symbol) and, on top,
 * the check against the breached-passwords database that `PasswordService`
 * does. Composition alone would not be enough; together with the check, it is
 * solid.
 */

export const MIN_LENGTH = 12;
/** A high cap so hashing cannot become a denial-of-service vector. */
export const MAX_LENGTH = 128;

export interface PolicyResult {
  isValid: boolean;
  /** Every failure, not just the first: fixing them one at a time is
   *  frustrating and pushes people to pick the weakest password that passes. */
  problems: string[];
}

const RULES: { test: RegExp; problem: string }[] = [
  { test: /[a-z]/, problem: 'Debe incluir al menos una letra minúscula.' },
  { test: /[A-Z]/, problem: 'Debe incluir al menos una letra mayúscula.' },
  { test: /[0-9]/, problem: 'Debe incluir al menos un número.' },
  {
    test: /[^A-Za-z0-9]/,
    problem: 'Debe incluir al menos un símbolo (por ejemplo: ! @ # $ % & *).',
  },
];

export function evaluatePolicy(password: string): PolicyResult {
  const problems: string[] = [];

  if (password.length < MIN_LENGTH) {
    problems.push(`Debe tener al menos ${MIN_LENGTH} caracteres.`);
  }
  if (password.length > MAX_LENGTH) {
    problems.push(`No puede superar los ${MAX_LENGTH} caracteres.`);
  }

  for (const rule of RULES) {
    if (!rule.test.test(password)) problems.push(rule.problem);
  }

  // A space at the start or the end is nearly always a copy-paste mistake, and
  // it produces a "the password does not work" that is impossible to diagnose.
  if (password !== password.trim()) {
    problems.push('No puede empezar ni terminar con espacios.');
  }

  return { isValid: problems.length === 0, problems };
}

/**
 * Rejects passwords built from the account's own data.
 *
 * `Mariana2026!` passes every composition rule and is among the first things
 * someone who knows the account's owner would try.
 */
export function derivesFromPersonalData(
  password: string,
  personal: { email?: string | undefined; displayName?: string | undefined },
): boolean {
  const normalized = password.toLowerCase();

  const fragments = [
    personal.email?.split('@')[0],
    ...(personal.displayName?.split(/\s+/) ?? []),
    'coco',
  ]
    .filter((fragment): fragment is string => Boolean(fragment && fragment.length >= 4))
    .map((fragment) => fragment.toLowerCase());

  return fragments.some((fragment) => normalized.includes(fragment));
}
