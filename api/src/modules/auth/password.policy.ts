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

export const LONGITUD_MINIMA = 12;
/** Tope alto para que argon2 no se convierta en un vector de denegación. */
export const LONGITUD_MAXIMA = 128;

export interface ResultadoDePolitica {
  valida: boolean;
  /** Todos los incumplimientos, no solo el primero: corregir de a uno es
   *  frustrante y empuja a elegir la contraseña más floja que pase. */
  problemas: string[];
}

const REGLAS: { prueba: RegExp; problema: string }[] = [
  { prueba: /[a-z]/, problema: 'Debe incluir al menos una letra minúscula.' },
  { prueba: /[A-Z]/, problema: 'Debe incluir al menos una letra mayúscula.' },
  { prueba: /[0-9]/, problema: 'Debe incluir al menos un número.' },
  {
    prueba: /[^A-Za-z0-9]/,
    problema: 'Debe incluir al menos un símbolo (por ejemplo: ! @ # $ % & *).',
  },
];

export function evaluarPolitica(password: string): ResultadoDePolitica {
  const problemas: string[] = [];

  if (password.length < LONGITUD_MINIMA) {
    problemas.push(`Debe tener al menos ${LONGITUD_MINIMA} caracteres.`);
  }
  if (password.length > LONGITUD_MAXIMA) {
    problemas.push(`No puede superar los ${LONGITUD_MAXIMA} caracteres.`);
  }

  for (const regla of REGLAS) {
    if (!regla.prueba.test(password)) problemas.push(regla.problema);
  }

  // Un espacio al inicio o al final casi siempre es un error de copiado, y
  // produce un "la contraseña no funciona" imposible de diagnosticar.
  if (password !== password.trim()) {
    problemas.push('No puede empezar ni terminar con espacios.');
  }

  return { valida: problemas.length === 0, problemas };
}

/**
 * Rechaza contraseñas construidas a partir de datos de la propia cuenta.
 *
 * `Gerardo2026!` cumple todas las reglas de composición y es de lo primero que
 * probaría alguien que conozca al dueño de la cuenta.
 */
export function derivaDeDatosPersonales(
  password: string,
  datos: { email?: string; displayName?: string },
): boolean {
  const normalizado = password.toLowerCase();

  const fragmentos = [
    datos.email?.split('@')[0],
    ...(datos.displayName?.split(/\s+/) ?? []),
    'coco',
  ]
    .filter((fragmento): fragmento is string => Boolean(fragmento && fragmento.length >= 4))
    .map((fragmento) => fragmento.toLowerCase());

  return fragmentos.some((fragmento) => normalizado.includes(fragmento));
}
