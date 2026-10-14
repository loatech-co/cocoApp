import { Camera, ClipboardPaste, ImagePlus, type LucideIcon } from 'lucide-react';
import { useRef } from 'react';

import { usePasteScreenshot } from '@/features/transactions/hooks/use-paste-screenshot';
import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { FilePicker } from '@/shared/ui/atoms/file-picker';

import { RECEIPT_TYPES } from './receipt-drop-zone';

/**
 * The three ways to give the first receipt, on the phone.
 *
 * ── Why no drop box here ────────────────────────────────────────────────────
 * Nothing is dragged on a phone: the box was a third of the sheet explaining a
 * gesture that cannot be made, and it pushed the fields below the fold.
 *
 * ── Why the camera is the system's and not `getUserMedia` ───────────────────
 * The viewer inside the sheet showed a black frame on the phone. A file field
 * with `capture` opens the phone's own camera —focus, flash, retake— and hands
 * back a file, so the photo goes through the same `onAdd` as any other
 * receipt: it is shrunk, read and fills the form.
 *
 * ── Why «Cargar una imagen» has no `capture` ────────────────────────────────
 * Without it, iOS and Android offer their own menu —photo library, camera or
 * files—, which is where a receipt received by mail or chat lives. It accepts
 * the same types as the desktop box, PDF included.
 *
 * All three in `outline` and full width: neither is the primary action of the
 * sheet —that is «Registrar», at the foot— and stacked they are three targets
 * a thumb cannot confuse.
 */
export function PhoneReceiptSources({
  onAdd,
  isCompact = false,
}: {
  onAdd: (files: File[]) => void;
  /**
   * Once the form is open the three go in one row, icon only: the fields
   * are what is being filled now, and three full-width buttons above them
   * pushed the concept below the fold. The name stays as `aria-label`.
   */
  isCompact?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const { paste, pasteProblem } = usePasteScreenshot(onAdd);
  const size = isCompact ? 'compact' : 'full';

  return (
    <div className={isCompact ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2'}>
      <Source
        size={size}
        Icon={Camera}
        label={t('transactions.supports.takePhotoNow')}
        onClick={() => camera.current?.click()}
      />
      <Source
        size={size}
        Icon={ClipboardPaste}
        label={t('transactions.supports.paste')}
        onClick={() => void paste()}
      />
      <Source
        size={size}
        Icon={ImagePlus}
        label={t('transactions.supports.uploadImage')}
        onClick={() => library.current?.click()}
      />

      {pasteProblem && (
        <p role="alert" className="w-full text-center text-xs text-muted-foreground">
          {pasteProblem}
        </p>
      )}

      <FilePicker ref={camera} accept="image/*" capture="environment" onFiles={onAdd} />
      <FilePicker ref={library} multiple accept={RECEIPT_TYPES} onFiles={onAdd} />
    </div>
  );
}

/** One source: icon and name, or —compact— the icon with the name for the ear. */
function Source({
  size,
  Icon,
  label,
  onClick,
}: {
  size: 'full' | 'compact';
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  const isCompact = size === 'compact';
  return (
    <Button
      type="button"
      variant="outline"
      size={isCompact ? 'md-icon' : 'md'}
      aria-label={isCompact ? label : undefined}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      {!isCompact && label}
    </Button>
  );
}
