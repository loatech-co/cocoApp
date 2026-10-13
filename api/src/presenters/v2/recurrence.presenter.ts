import type {
  DiscardedCharges,
  PausedCharge,
  RecurrencePause,
} from '../../modules/recurrence/recurrence.domain';

/** v2 bodies of the pauses of a recurring concept (see `transactions.presenter.ts`). */

export function recurrencePauseV2(pause: RecurrencePause): RecurrencePause {
  return pause;
}

export function pausedChargeV2(charge: PausedCharge): PausedCharge {
  return charge;
}

export function discardedChargesV2(discarded: DiscardedCharges): DiscardedCharges {
  return discarded;
}
