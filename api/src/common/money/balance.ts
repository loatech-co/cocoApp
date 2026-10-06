import { ZERO, toMoney, type Money } from './money';
import type {
  AccountType,
  TransactionStatus,
  TransactionType,
  TransferDirection,
} from '../../generated/prisma/client';

/** Lo mínimo que hace falta de un movimiento para calcular un saldo. */
export interface BalanceMovement {
  type: TransactionType;
  /** Solo relevante cuando `type === 'transfer'`. */
  transferDir: TransferDirection | null;
  amount: Money;
  status: TransactionStatus;
}

export interface DerivedBalance {
  /** Solo movimientos `cleared`. Es el saldo que el banco confirmaría. */
  cleared: Money;
  /** Incluye los `pending`. Es "cuánto voy a tener cuando todo aterrice". */
  projected: Money;
}

/** Las cuentas de crédito son PASIVO: el saldo representa deuda, no dinero. */
const LIABILITY_TYPES: ReadonlySet<AccountType> = new Set<AccountType>(['credit']);

function isLiabilityAccount(type: AccountType): boolean {
  return LIABILITY_TYPES.has(type);
}

/**
 * Efecto de un movimiento sobre el saldo de UNA cuenta de activo
 * (efectivo, débito, banco, ahorros, otro).
 *
 *   ingreso        → suma
 *   gasto          → resta
 *   transferencia  → suma si entra, resta si sale
 *
 * Una transferencia sin dirección es un dato corrupto: no se puede adivinar de
 * qué lado está el dinero, así que aporta cero en vez de inventar un signo.
 */
function deltaAsAsset(movement: BalanceMovement): Money {
  switch (movement.type) {
    case 'income':
      return movement.amount;
    case 'expense':
      return movement.amount.negated();
    case 'transfer':
      if (movement.transferDir === 'in') return movement.amount;
      if (movement.transferDir === 'out') return movement.amount.negated();
      return ZERO;
  }
}

/**
 * Calcula el saldo DERIVADO de una cuenta.
 *
 * No existe ninguna columna de saldo en la base, y es a propósito: un saldo
 * almacenado se desincroniza en cuanto un camino de escritura se olvida de
 * actualizarlo, y entonces la cifra que ve el usuario deja de ser la suma real
 * de sus movimientos. Aquí siempre se calcula.
 *
 * En cuentas de crédito el signo se invierte: el saldo representa lo ADEUDADO,
 * así que un gasto lo aumenta y un pago (una transferencia que entra a la
 * tarjeta) lo reduce.
 */
export function computeBalance(
  accountType: AccountType,
  openingBalance: Money,
  movements: readonly BalanceMovement[],
): DerivedBalance {
  const isLiability = isLiabilityAccount(accountType);

  let cleared = toMoney(openingBalance);
  let projected = toMoney(openingBalance);

  for (const movement of movements) {
    const delta = isLiability ? deltaAsAsset(movement).negated() : deltaAsAsset(movement);

    projected = projected.plus(delta);
    if (movement.status === 'cleared') {
      cleared = cleared.plus(delta);
    }
  }

  return { cleared: toMoney(cleared), projected: toMoney(projected) };
}

/**
 * Cupo disponible de una tarjeta: `credit_limit − saldo_adeudado`.
 *
 * Puede quedar negativo si se excedió el cupo. El sistema lo informa y no lo
 * bloquea: no-rigidez.
 */
export function computeAvailableCredit(
  creditLimit: Money | null,
  balanceOwed: Money,
): Money | null {
  if (creditLimit === null) return null;
  return toMoney(creditLimit.minus(balanceOwed));
}
