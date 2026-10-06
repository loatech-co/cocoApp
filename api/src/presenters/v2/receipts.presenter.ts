import type { Receipt } from '../../modules/receipts/receipts.service';

/** v2 body of a receipt (see `transactions.presenter.ts`). */
export function receiptV2(receipt: Receipt): Receipt {
  return receipt;
}
