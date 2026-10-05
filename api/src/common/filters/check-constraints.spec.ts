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
    const raw = 'new row for relation "categories" violates check constraint "ck_categories_payment_day_range"';

    expect(checkViolationMessage(raw)).toBe('El día de pago va del 1 al 31.');
  });

  it('falls back to a generic sentence for a constraint it does not know', () => {
    expect(checkViolationMessage('violates check constraint "ck_other_rule"')).toBe(
      'Los datos no cumplen una regla de la base de datos.',
    );
  });

  it('is null for anything that is not a CHECK violation', () => {
    expect(checkViolationMessage('duplicate key value violates unique constraint "uq_x"')).toBeNull();
  });
});
