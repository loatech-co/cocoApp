import { PenLine } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';

import { PhoneReceiptSources } from './phone-receipt-sources';

/**
 * How a new transaction starts on the phone: from the receipt or by hand.
 *
 * ── Why the fields wait behind a button here, and not on the desktop ────────
 * On the phone the receipt is the usual start —the photo of the ticket, the
 * screenshot of the transfer— and the reading fills the fields. Shown from the
 * first instant, the fields pushed the three sources into a corner and filled
 * a small screen with boxes that the receipt was about to fill anyway. The
 * desktop has room for both side by side, so it keeps the form open.
 *
 * Any of the three sources opens the form too: what was read lands in it.
 *
 * «Registrar manualmente» is a button like the three —`outline`, full width,
 * icon and name—: as a bare link it read as a footnote, not as one of the
 * ways in. The extra gap above it keeps it apart from the receipt sources: it
 * is the road without a receipt.
 */
export function PhoneEntryGate({
  onAdd,
  onManual,
}: {
  onAdd: (files: File[]) => void;
  onManual: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <PhoneReceiptSources onAdd={onAdd} />
      <Button type="button" variant="outline" size="md" className="mt-2" onClick={onManual}>
        <PenLine aria-hidden="true" />
        {t('transactions.sheet.registerManually')}
      </Button>
    </div>
  );
}
