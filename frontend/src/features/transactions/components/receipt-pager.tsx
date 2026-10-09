import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { OverlayButton, ControlSeparator } from '@/shared/ui/molecules/overlay-control';

/**
 * The arrows and the counter of the receipts, over the document.
 *
 * Both the column of a saved transaction and that of one being
 * created draw it, and it was the same piece written twice. It only shows with more than
 * one: with a single receipt, «1 de 1» and two disabled arrows are three
 * controls that do nothing. The rule at the end separates moving from what
 * modifies (see `ControlSeparator`).
 */
export function ReceiptPager({
  index,
  total,
  onGo,
}: {
  index: number;
  total: number;
  onGo: (index: number) => void;
}) {
  if (total <= 1) return null;

  return (
    <>
      <OverlayButton
        label={t('transactions.supports.previous')}
        disabled={index === 0}
        onClick={() => onGo(index - 1)}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </OverlayButton>
      <span className="tabular px-1 text-xs font-medium text-sala-tinta">
        {index + 1} / {total}
      </span>
      <OverlayButton
        label={t('transactions.supports.next')}
        disabled={index === total - 1}
        onClick={() => onGo(index + 1)}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </OverlayButton>
      <ControlSeparator />
    </>
  );
}
