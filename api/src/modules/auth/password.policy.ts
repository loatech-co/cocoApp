/**
 * Política de contraseñas.
 *
 * Lógica pura y sin dependencias para poder probarla exhaustivamente: es la
 * única barrera entre una cuenta y quien intente adivinarla.
 *
 * Nota sobre el diseño: NIST SP 800-63B desaconseja las reglas de composición
 * (exigir mayúscula, número y símbolo) porque empujan a la gente hacia
 * variaciones predecibles del tipo `P@ssw0rd1!`, que cumplen todo y están en
 * cualquier diccionario de ataque. Lo que sí funciona es la LONGITUD y
 * contrastar contra contraseñas ya filtradas.
 *
 * Aquí se aplican las dos cosas: la composición que pidió el dueño del producto
 * (12 caracteres con mayúscula, minúscula, número y símbolo) y, encima, el
 * contraste contra la base de filtradas que hace `PasswordService`. La
 * composición sola sería insuficiente; junto al contraste, es sólida.
 */

export const MIN_LENGTH = 12;
/** Tope alto para que argon2 no se convierta en un vector de denegación. */
export const MAX_LENGTH = 128;

export interface PolicyResult {
  isValid: boolean;
  /** Todos los incumplimientos, no solo el primero: corregir de a uno es
   *  frustrante y empuja a elegir la contraseña más floja que pase. */
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

  // Un espacio al inicio o al final casi siempre es un error de copiado, y
  // produce un "la contraseña no funciona" imposible de diagnosticar.
  if (password !== password.trim()) {
    problems.push('No puede empezar ni terminar con espacios.');
  }

  return { isValid: problems.length === 0, problems };
}

/**
 * Rechaza contraseñas construidas a partir de datos de la propia cuenta.
 *
 * `Gerardo2026!` cumple todas las reglas de composición y es de lo primero que
 * probaría alguien que conozca al dueño de la cuenta.
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
