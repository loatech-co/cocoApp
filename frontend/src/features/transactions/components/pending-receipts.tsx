import { Camera, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';

import { t } from '@/shared/lib/i18n';
import { useObjectUrls } from '@/shared/lib/object-url';
import { Button } from '@/shared/ui/atoms/button';
import { OverlayButton } from '@/shared/ui/molecules/overlay-control';

import { DropZone } from './receipt-drop-zone';
import { ReceiptPager } from './receipt-pager';
import { FilePreview } from './receipt-preview';
import { UploadPanel } from './receipt-upload-panel';

interface PendingReceiptsProps {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  /** Hands the sheet over to the camera; what it captures comes back through `onAdd`'s owner. */
  onTakePhoto: () => void;
}

/**
 * The receipts picked before the transaction exists.
 *
 * ── Why the `blob:` URLs live here ──────────────────────────────────────────
 * Because both the preview and the controls that move from one to the next look at them:
 * created in each place, the same file would be loaded twice in memory.
 * Here they are created once and released together.
 */
export function PendingReceipts(props: PendingReceiptsProps) {
  const { files, onAdd, onRemove, onTakePhoto } = props;
  const [activeIndex, setActiveIndex] = useState(0);
  const urls = useObjectUrls(files);
  /** The upload panel, over the sheet. The same one the gallery of an already
      saved one opens. */
  const [isAdding, setIsAdding] = useState(false);

  // The one being shown, clamped: removing the last one left the index
  // pointing at a file that no longer exists.
  const i = Math.min(activeIndex, files.length - 1);
  const enseñado = i >= 0 ? files[i] : undefined;

  return (
    /*
      `min-h-0 flex-1` ALWAYS, and not only when it is empty.

      It only had it in the empty case, which is when the drop slot has
      to fill the column. But with a document inside the same happens: if
      this box measures what its children measure, the previewer has nothing
      to grow against and stays at its minimum height with the rest of the column
      blank below.
    */
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
        The same column as that of an already saved transaction: ONE
        preview with its controls on top, no thumbnail row. What
        changes is where the files come from —memory, not the server—
        and that here there is no full-screen lightbox to open: the receipt does not
        exist anywhere until the transaction is saved.
      */}
      {enseñado && (
        <FilePreview
          // The key is the FILE and not its url: with the url, the frame
          // unmounted and mounted again as soon as the `blob:` was created.
          key={`${enseñado.name}-${i}`}
          url={urls[i]}
          isImage={enseñado.type.startsWith('image/')}
          actions={
            <PendingActions
              index={i}
              total={files.length}
              onGoTo={setActiveIndex}
              onAdd={() => setIsAdding(true)}
              onRemove={onRemove}
            />
          }
        />
      )}

      {files.length === 0 && (
        <EmptyPendingReceipts
          onAdd={onAdd}
          onLoad={() => setIsAdding(true)}
          onTakePhoto={onTakePhoto}
        />
      )}

      {isAdding && (
        <UploadPanel
          isUploading={false}
          progress={0}
          onFiles={(added) => {
            onAdd(added);
            setIsAdding(false);
          }}
          onClose={() => setIsAdding(false)}
        />
      )}
    </div>
  );
}

/**
 * No receipt yet: the drop box and the two paths that used to
 * be the chooser.
 *
 * "Cargar archivo" opens the same upload panel the chooser opened —drag, pick
 * or paste, over the sheet— and "Tomar foto" hands the sheet to the camera.
 * Both end in `scan` through the owner's `onAdd`, so what a file or a
 * photo does to the form is exactly what it did from the chooser; only where
 * it starts changed.
 *
 * Same size for both and `outline` for both: neither is the primary action of
 * this sheet —that is "Registrar", at the foot— and a filled button here would
 * compete with it.
 */
function EmptyPendingReceipts({
  onAdd,
  onLoad,
  onTakePhoto,
}: {
  onAdd: (files: File[]) => void;
  onLoad: () => void;
  onTakePhoto: () => void;
}) {
  return (
    <>
      <div className="flex min-h-0 flex-1">
        <DropZone isUploading={false} progress={0} isAlone onFiles={onAdd} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button type="button" variant="outline" size="sm" onClick={onLoad}>
          <Upload aria-hidden="true" />
          {t('transactions.supports.uploadFile')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onTakePhoto}>
          <Camera aria-hidden="true" />
          {t('transactions.supports.takePhoto')}
        </Button>
      </div>
    </>
  );
}

/** The controls over the document: move, add and remove. */
function PendingActions({
  index,
  total,
  onGoTo,
  onAdd,
  onRemove,
}: {
  index: number;
  total: number;
  onGoTo: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      <ReceiptPager index={index} total={total} onGo={onGoTo} />

      <OverlayButton label={t('transactions.supports.addAnother')} onClick={onAdd}>
        <Plus className="size-4" aria-hidden="true" />
      </OverlayButton>

      {/* No question is asked here before removing: what goes is a file that
          has not been saved anywhere yet, so putting it back
          is dragging it again. */}
      <OverlayButton
        label={t('transactions.supports.removeThis')}
        onClick={() => {
          onRemove(index);
          if (index > 0) onGoTo(index - 1);
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </OverlayButton>
    </>
  );
}
