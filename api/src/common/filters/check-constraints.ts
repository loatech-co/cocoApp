/**
 * What to tell the user when a CHECK constraint rejects a write.
 *
 * The API validates these rules before writing and answers with its own
 * sentence; the constraints are the second line, for whatever reaches the
 * table some other way. When one fires, the client still deserves a 422 that
 * says which rule it broke, not a 500.
 *
 * Prisma (6, with the pg adapter) does not map Postgres 23514 to a known
 * error code: it arrives as an unknown request error whose message carries
 * the constraint name. That name is the only stable handle, so the messages
 * are keyed by it — they live next to the migration that creates them
 * (`20261005151000_add_recurrence_checks`).
 */
const MESSAGES: Readonly<Record<string, string>> = {
  ck_categories_recurring_has_periodicity:
    'Un concepto recurrente necesita una periodicidad: cada cuánto vuelve.',
  ck_categories_payment_month_not_monthly:
    'El mes de pago solo aplica a lo que no es mensual: lo mensual toca todos los meses.',
  ck_categories_payment_day_range: 'El día de pago va del 1 al 31.',
  ck_categories_payment_month_range: 'El mes va del 1 al 12.',
  ck_categories_multi_payment_not_auto:
    'Un concepto no puede tener «pago automático» y «se paga en varias veces» a la vez.',
  ck_categories_multi_payment_recurring:
    '«Se paga en varias veces» solo significa algo en un concepto recurrente.',
};

const GENERIC_MESSAGE = 'Los datos no cumplen una regla de la base de datos.';

const CHECK_VIOLATION = /violates check constraint \\?"([a-z0-9_]+)\\?"/;

/**
 * If `errorMessage` is a CHECK violation, the sentence for it; otherwise null.
 * Unknown constraint names still count as a violation, with a generic sentence.
 */
export function checkViolationMessage(errorMessage: string): string | null {
  const match = CHECK_VIOLATION.exec(errorMessage);
  if (!match) return null;
  const [, name = ''] = match; // the group is mandatory in the pattern
  return MESSAGES[name] ?? GENERIC_MESSAGE;
}
