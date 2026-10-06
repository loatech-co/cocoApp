import type {
  Transaction,
  TransactionPage,
  Transfer,
} from '../../modules/transactions/transactions.domain';

/**
 * v2 bodies of the transactions.
 *
 * The domain is already in English and camelCase, which is what v2 is, so
 * today these hand it over as it is. They are still the one place a v2 body
 * is built: if the domain grows a field v2 must not show, `shapes.spec.ts`
 * fails and the field is dropped here.
 */

export function transactionV2(transaction: Transaction): Transaction {
  return transaction;
}

export function transactionPageV2(page: TransactionPage): TransactionPage {
  return { data: page.data.map(transactionV2), meta: page.meta };
}

export function transferV2(transfer: Transfer): Transfer {
  return { transferGroupId: transfer.transferGroupId, legs: transfer.legs.map(transactionV2) };
}
