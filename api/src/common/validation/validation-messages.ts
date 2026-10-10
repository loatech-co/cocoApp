/**
 * The Spanish for class-validator's default messages.
 *
 * Most decorators carry their own Spanish `message`, but the ones that do not
 * —and the two checks class-validator writes itself, an undeclared property
 * and a nested object that is not one— answered in English, mixed with the
 * Spanish ones: `POST /auth/register` with an extra field said
 * "property name should not exist". This is where those defaults become what
 * the person reads.
 *
 * A message is translated only when it IS the default: each entry matches the
 * English sentence after the property, so a decorator's own message (even one
 * that starts with the property's name, like `last4 …`) passes through as it
 * was written. A default with no entry here also passes through: the unit test
 * lists the constraints the DTOs use, so a new one fails there first.
 */

/** One default: its English tail after the property, and the Spanish. */
interface DefaultMessage {
  readonly english: RegExp;
  readonly spanish: (field: string, match: RegExpMatchArray) => string;
}

const field = (name: string): string => `El campo «${name}»`;

/** By constraint name, the key class-validator puts in `constraints`. */
const DEFAULT_MESSAGES: Readonly<Record<string, DefaultMessage>> = {
  isString: {
    english: /^must be a string$/,
    spanish: (f) => `${field(f)} tiene que ser un texto.`,
  },
  isInt: {
    english: /^must be an integer number$/,
    spanish: (f) => `${field(f)} tiene que ser un número entero.`,
  },
  isNumber: {
    english: /^must be a number conforming to the specified constraints$/,
    spanish: (f) => `${field(f)} tiene que ser un número.`,
  },
  isBoolean: {
    english: /^must be a boolean value$/,
    spanish: (f) => `${field(f)} tiene que ser verdadero o falso.`,
  },
  isArray: {
    english: /^must be an array$/,
    spanish: (f) => `${field(f)} tiene que ser una lista.`,
  },
  isNotEmpty: {
    english: /^should not be empty$/,
    spanish: (f) => `${field(f)} no puede estar vacío.`,
  },
  isEmail: {
    english: /^must be an email$/,
    spanish: (f) => `${field(f)} tiene que ser un correo válido.`,
  },
  isUuid: {
    english: /^must be a UUID$/,
    spanish: (f) => `${field(f)} tiene que ser un identificador válido.`,
  },
  isDateString: {
    english: /^must be a valid ISO 8601 date string$/,
    spanish: (f) => `${field(f)} tiene que ser una fecha válida (AAAA-MM-DD).`,
  },
  isIso8601: {
    english: /^must be a valid ISO 8601 date string$/,
    spanish: (f) => `${field(f)} tiene que ser una fecha válida (AAAA-MM-DD).`,
  },
  isIn: {
    english: /^must be one of the following values: (.*)$/,
    spanish: (f, m) => `${field(f)} tiene que ser uno de estos valores: ${m[1] ?? ''}.`,
  },
  isEnum: {
    english: /^must be one of the following values: (.*)$/,
    spanish: (f, m) => `${field(f)} tiene que ser uno de estos valores: ${m[1] ?? ''}.`,
  },
  matches: {
    english: /^must match .* regular expression$/,
    spanish: (f) => `${field(f)} no tiene el formato esperado.`,
  },
  maxLength: {
    english: /^must be shorter than or equal to (\d+) characters$/,
    spanish: (f, m) => `${field(f)} admite como mucho ${m[1] ?? ''} caracteres.`,
  },
  minLength: {
    english: /^must be longer than or equal to (\d+) characters$/,
    spanish: (f, m) => `${field(f)} necesita al menos ${m[1] ?? ''} caracteres.`,
  },
  min: {
    english: /^must not be less than (\S+)$/,
    spanish: (f, m) => `${field(f)} no puede ser menor que ${m[1] ?? ''}.`,
  },
  max: {
    english: /^must not be greater than (\S+)$/,
    spanish: (f, m) => `${field(f)} no puede ser mayor que ${m[1] ?? ''}.`,
  },
  arrayMaxSize: {
    english: /^must contain no more than (\d+) elements$/,
    spanish: (f, m) => `${field(f)} admite como mucho ${m[1] ?? ''} elementos.`,
  },
  arrayMinSize: {
    english: /^must contain at least (\d+) elements$/,
    spanish: (f, m) => `${field(f)} necesita al menos ${m[1] ?? ''} elementos.`,
  },
};

/** The constraint names that have a Spanish default. */
export const TRANSLATED_CONSTRAINTS: readonly string[] = Object.keys(DEFAULT_MESSAGES);

/**
 * The message the person reads for `constraint` on `property`, reached by
 * `path` (`splits.0.amount`). Anything that is not a known English default is
 * returned untouched.
 */
export function spanishValidationMessage(
  constraint: string,
  property: string,
  path: string,
  message: string,
): string {
  if (message === `property ${property} should not exist`) {
    return `${field(path)} no se admite en esta solicitud.`;
  }
  if (/^(each value in )?nested property \S+ must be either object or array$/.test(message)) {
    return `${field(path)} tiene que ser un objeto o una lista.`;
  }
  if (message === 'an unknown value was passed to the validate function') {
    return 'El cuerpo de la solicitud no es válido.';
  }

  const entry = DEFAULT_MESSAGES[constraint];
  if (entry === undefined) return message;

  const eachPrefix = 'each value in ';
  const isEach = message.startsWith(eachPrefix);
  const rest = isEach ? message.slice(eachPrefix.length) : message;
  if (!rest.startsWith(`${property} `)) return message;

  const match = rest.slice(property.length + 1).match(entry.english);
  if (match === null) return message;
  const spanish = entry.spanish(path, match);
  return isEach ? spanish.replace(/^El campo/, 'Cada valor del campo') : spanish;
}
