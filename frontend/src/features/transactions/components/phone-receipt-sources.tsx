import { Camera, ClipboardPaste, ImagePlus } from 'lucide-react';
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
export function PhoneReceiptSources({ onAdd }: { onAdd: (files: File[]) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const { paste, pasteProblem } = usePasteScreenshot(onAdd);

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" onClick={() => camera.current?.click()}>
        <Camera aria-hidden="true" />
        {t('transactions.supports.takePhotoNow')}
      </Button>
      <Button type="button" variant="outline" onClick={() => void paste()}>
        <ClipboardPaste aria-hidden="true" />
        {t('transactions.supports.paste')}
      </Button>
      <Button type="button" variant="outline" onClick={() => library.current?.click()}>
        <ImagePlus aria-hidden="true" />
        {t('transactions.supports.uploadImage')}
      </Button>

      {pasteProblem && (
        <p role="alert" className="text-center text-xs text-muted-foreground">
          {pasteProblem}
        </p>
      )}

      <FilePicker ref={camera} accept="image/*" capture="environment" onFiles={onAdd} />
      <FilePicker ref={library} multiple accept={RECEIPT_TYPES} onFiles={onAdd} />
    </div>
  );
}
