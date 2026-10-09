import { useEffect } from 'react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';

import { DropZone } from './receipt-drop-zone';

/**
 * The upload box, over the sheet that asked for it.
 *
 * ── Why a panel on top and not a step inside ────────────────────────────────
 * Because adding a receipt is not a stage of the form: it is something done
 * IN THE MIDDLE of something else —reviewing a sheet, correcting an amount— and
 * then you go back to what you were doing. A step forces leaving the sheet,
 * changes what is on screen and leaves the doubt of whether what was written is
 * still there; a panel on top keeps the sheet in sight, behind.
 *
 * And it serves both places that open it: the «Subir un archivo» path of a
 * new transaction and the gallery tile of one that already has receipts. Without
 * it they were two different screens for the same gesture.
 *
 * ── Why Escape is caught in CAPTURE ─────────────────────────────────────────
 * The transaction sheet listens for Escape on the document to close itself. This
 * panel mounts later, so its listener would run second and the sheet would
 * close anyway —with what was written inside—. In capture it arrives first and
 * stops the event: Escape closes the panel and nothing else.
 */
export function UploadPanel({
  isUploading,
  progress,
  onFiles,
  onClose,
}: {
  isUploading: boolean;
  progress: number;
  onFiles: (files: File[]) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onPress = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', onPress, true);
    return () => document.removeEventListener('keydown', onPress, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('transactions.supports.add')}
      // Above the sheet, which is at z-50, same as the lightbox.
      className={cn(
        'fixed inset-0 z-[60] flex items-end justify-center bg-[var(--velo)] backdrop-blur-sm',
        // 24 to the edge of the screen, like every sheet on the phone.
        'p-6',
        'se-revela sm:items-center sm:p-4',
      )}
      // `onMouseDown` and not `onClick`: with click, dragging from inside the
      // panel to the scrim —which is exactly what dropping a
      // file does— would close it mid-gesture.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          'flex w-full flex-col p-4 sm:max-w-xl sm:p-5',
          FLOATING_SURFACE,
          'emerge rounded-lg',
        )}
      >
        <DropZone isUploading={isUploading} progress={progress} isAlone onFiles={onFiles} />
      </div>
    </div>
  );
}
