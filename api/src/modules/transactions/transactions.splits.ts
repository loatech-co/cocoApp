import type { SplitDto } from './dto/transaction.dto';
import type { SplitToWrite } from './transactions.repository';
import { ValidationError } from '../../common/errors/domain-error';
import { serialize, toMoney, type Money } from '../../common/money/money';
import { checkSplitsReconcile } from '../../common/money/splits';

/** Valida el cuadre y normaliza los splits. Lanza 422 si no cuadran. */
export function splitsParaEscribir(
  amountCabecera: Money,
  splits: readonly SplitDto[] | undefined,
): SplitToWrite[] {
  if (!splits || splits.length === 0) return [];

  const montos = splits.map((split) => toMoney(split.amount));
  const cuadre = checkSplitsReconcile(amountCabecera, montos);

  if (!cuadre.balances) {
    throw new ValidationError(
      `La suma de los splits (${serialize(cuadre.total)}) no coincide con el monto (${serialize(amountCabecera)}). Diferencia: ${serialize(cuadre.difference)}.`,
      { code: 'splits_unbalanced' },
    );
  }

  return splits.map((split, indice) => ({
    categoryId: split.category_id !== undefined ? BigInt(split.category_id) : null,
    amount: montos[indice] ?? toMoney(split.amount), // mismo valor: montos[i] es este
    note: split.note ?? null,
  }));
}
