import type {
  AccountType,
  TransactionStatus,
  TransactionType,
  TransferDirection,
} from '@prisma/client';

import { CERO, toMoney, type Money } from './money';

/** Lo mínimo que hace falta de un movimiento para calcular un saldo. */
export interface MovimientoDeSaldo {
  type: TransactionType;
  /** Solo relevante cuando `type === 'transfer'`. */
  transferDir: TransferDirection | null;
  amount: Money;
  status: TransactionStatus;
}

export interface SaldoDerivado {
  /** Solo movimientos `cleared`. Es el saldo que el banco confirmaría. */
  cleared: Money;
  /** Incluye los `pending`. Es "cuánto voy a tener cuando todo aterrice". */
  proyectado: Money;
}

/** Las cuentas de crédito son PASIVO: el saldo representa deuda, no dinero. */
const TIPOS_DE_PASIVO: ReadonlySet<AccountType> = new Set<AccountType>(['credit']);

export function esCuentaDePasivo(tipo: AccountType): boolean {
  return TIPOS_DE_PASIVO.has(tipo);
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
function deltaComoActivo(movimiento: MovimientoDeSaldo): Money {
  switch (movimiento.type) {
    case 'income':
      return movimiento.amount;
    case 'expense':
      return movimiento.amount.negated();
    case 'transfer':
      if (movimiento.transferDir === 'in') return movimiento.amount;
      if (movimiento.transferDir === 'out') return movimiento.amount.negated();
      return CERO;
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
export function calcularSaldo(
  tipoDeCuenta: AccountType,
  openingBalance: Money,
  movimientos: readonly MovimientoDeSaldo[],
): SaldoDerivado {
  const esPasivo = esCuentaDePasivo(tipoDeCuenta);

  let cleared = toMoney(openingBalance);
  let proyectado = toMoney(openingBalance);

  for (const movimiento of movimientos) {
    const delta = esPasivo ? deltaComoActivo(movimiento).negated() : deltaComoActivo(movimiento);

    proyectado = proyectado.plus(delta);
    if (movimiento.status === 'cleared') {
      cleared = cleared.plus(delta);
    }
  }

  return { cleared: toMoney(cleared), proyectado: toMoney(proyectado) };
}

/**
 * Cupo disponible de una tarjeta: `credit_limit − saldo_adeudado`.
 *
 * Puede quedar negativo si se excedió el cupo. El sistema lo informa y no lo
 * bloquea: no-rigidez.
 */
export function calcularCupoDisponible(
  creditLimit: Money | null,
  saldoAdeudado: Money,
): Money | null {
  if (creditLimit === null) return null;
  return toMoney(creditLimit.minus(saldoAdeudado));
}
