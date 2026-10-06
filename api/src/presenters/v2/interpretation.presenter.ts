import { transactionV2 } from './transactions.presenter';
import type { Capture, Interpretation } from '../../modules/interpretation/interpretation.domain';

/** v2 bodies of the interpretation and the capture (see `transactions.presenter.ts`). */

export function interpretationV2(interpretation: Interpretation): Interpretation {
  return interpretation;
}

export function captureV2(capture: Capture): Capture {
  return { ...capture, transaction: transactionV2(capture.transaction) };
}
