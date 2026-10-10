import { FileWarning } from 'lucide-react';

import type { ReceiptFailure } from '@/features/transactions/model/receipts';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';

/**
 * The slot of a receipt that cannot be seen, saying why.
 *
 * ── The two reasons are not answered the same way ───────────────────────────
 * `ausente` is final: the server looked at the disk and the file is not there, so
 * retrying will not bring it and the useful thing is to say where to look —the
 * record is in the database, the file on each server's disk, and they sync
 * separately—.
 *
 * `sin-cargar` says nothing about the file: the download failed and it may have
 * been a 500, an expired session or the network. There retrying makes sense, and
 * claiming it «no está» would be lying about something that is probably there.
 *
 * Both went down the same path, and a receipt that existed got «no está
 * en el servidor».
 *
 * ── Why it is not red ───────────────────────────────────────────────────────
 * Because nothing that was just done failed: the transaction is fine and
 * so is its sheet. Red in this app is reserved for what went wrong and for
 * what cannot be undone.
 *
 * `isDark` is for the full-screen lightbox, whose background already is: the
 * app's gray would disappear on top of it.
 */
export function UnavailableReceipt({
  error,
  onRetry,
  isDark = false,
}: {
  error: ReceiptFailure;
  onRetry?: (() => void) | undefined;
  isDark?: boolean;
}) {
  return (
    <span
      className={cn(
        'grid size-full place-items-center px-6 text-center',
        isDark ? 'text-stage-ink/70' : 'text-muted-foreground',
      )}
      role="status"
    >
      <span className="flex max-w-xs flex-col items-center gap-2 text-sm">
        <FileWarning className="size-6 shrink-0" aria-hidden="true" />
        {error === 'ausente' ? (
          <span>{t('transactions.supports.missingFile')}</span>
        ) : (
          <>
            <span>{t('transactions.supports.loadFailed')}</span>
            {onRetry && (
              <Button type="button" variant="outline" size="sm" className="mt-1" onClick={onRetry}>
                {t('transactions.supports.retry')}
              </Button>
            )}
          </>
        )}
      </span>
    </span>
  );
}
