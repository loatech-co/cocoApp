import { checkViolationMessage } from './check-constraints';

describe('checkViolationMessage', () => {
  it('names the rule of a known constraint', () => {
    const raw =
      'ConnectorError(... PostgresError { code: "23514", message: "new row for relation \\"categories\\" ' +
      'violates check constraint \\"ck_categories_multi_payment_not_auto\\"" ...)';

    expect(checkViolationMessage(raw)).toBe(
      'Un concepto no puede tener «pago automático» y «se paga en varias veces» a la vez.',
    );
  });

  it('reads the name without escaped quotes too', () => {
    const raw =
      'new row for relation "categories" violates check constraint "ck_categories_payment_day_range"';

    expect(checkViolationMessage(raw)).toBe('El día de pago va del 1 al 31.');
  });

  it('falls back to a generic sentence for a constraint it does not know', () => {
    expect(checkViolationMessage('violates check constraint "ck_other_rule"')).toBe(
      'Los datos no cumplen una regla de la base de datos.',
    );
  });

  // The CHECK names did not move in 7.2-r5 (they already followed the
  // convention); the renamed ones are keys, foreign keys and indexes, and
  // those are not CHECK violations.
  it.each([
    ['ck_categories_recurring_has_periodicity', 'necesita una periodicidad'],
    ['ck_categories_payment_month_not_monthly', 'mes de pago'],
    ['ck_categories_payment_day_range', 'día de pago'],
    ['ck_categories_payment_month_range', 'mes va del 1 al 12'],
    ['ck_categories_multi_payment_not_auto', 'pago automático'],
    ['ck_categories_multi_payment_recurring', 'solo significa algo'],
  ])('gives %s its own sentence', (constraint, words) => {
    const message = checkViolationMessage(`violates check constraint "${constraint}"`);

    expect(message).toContain(words);
    expect(message).not.toBe('Los datos no cumplen una regla de la base de datos.');
  });

  it.each([
    'insert or update on table "transactions" violates foreign key constraint "fk_transactions_category_id"',
    'duplicate key value violates unique constraint "uq_tags_user_id_lower_name"',
    'duplicate key value violates unique constraint "pk_transaction_tags"',
  ])('is null for a renamed key or index: %s', (raw) => {
    expect(checkViolationMessage(raw)).toBeNull();
  });

  it('is null for anything that is not a CHECK violation', () => {
    expect(
      checkViolationMessage('duplicate key value violates unique constraint "uq_x"'),
    ).toBeNull();
  });
});
