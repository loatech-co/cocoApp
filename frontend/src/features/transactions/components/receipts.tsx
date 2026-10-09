import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useSupportFiles, useSupportUpload } from '@/features/transactions/hooks/use-support-files';
import { type Receipt } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { OverlayButton } from '@/shared/ui/molecules/overlay-control';

import { ConfirmSupportDeletion } from './confirm-support-deletion';
import { DropZone } from './support-drop-zone';
import { SupportPager } from './support-pager';
import { FilePreview } from './support-preview';
import { UploadPanel } from './support-upload-panel';
import { Lightbox } from './support-viewer';

/** What the gallery remembers: which one is shown, which one is being deleted, which one is enlarged. */
function useSupportGallery(transactionId: number) {
  /**
   * Adding: the upload panel opens on top of the sheet.
   *
   * The 104px tile only has room for an icon: it neither explains what is accepted
   * nor has room for the paste button, which is where half of the
   * receipts come from. So adding happens in the big box, and you come back from there.
   */
  const [isAdding, setIsAdding] = useState(false);
  /** The receipt about to be deleted from the column, waiting for the yes. */
  const [isDeleting, setIsDeleting] = useState<Receipt | null>(null);
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);
  /**
   * Which one is being shown on top.
   *
   * A sheet is opened to look at the paper, not to look at eight little
   * 104px squares: the column of a saved transaction shows the document large,
   * same as that of one being created.
   */
  const [activeIndex, setActiveIndex] = useState(0);

  return {
    files: useSupportFiles(transactionId),
    upload: useSupportUpload(transactionId, () => setIsAdding(false)),
    isAdding,
    setIsAdding,
    isDeleting,
    setIsDeleting,
    enlargedIndex,
    setEnlargedIndex,
    activeIndex,
    setActiveIndex,
  };
}

type Gallery = ReturnType<typeof useSupportGallery>;

/**
 * A transaction's receipts: the receipt that proves the payment existed.
 *
 * ── Why the large document and not tabs ─────────────────────────────────────
 * Because "Receipt 1 de 8" says nothing. Eight identical tabs force
 * opening them one by one to find the bill you are looking for, which is
 * exactly the work you came to avoid. A drawn page is
 * recognized at a glance: the water bill does not look like the school one.
 *
 * The files are requested with the token and arrive as `blob:`; the why is in
 * `useSupportFiles`.
 */
export function Receipts({ transactionId }: { transactionId: number }) {
  const g = useSupportGallery(transactionId);
  const { list } = g.files;

  if (g.files.isLoading) {
    /*
      ── The height already reserved ───────────────────────────────────────
      While they are requested, the column takes the same as what is coming:
      the drop box measures 246 on the phone (its `min-h-36`, its
      padding, the label and the paste button) and the preview, from 220
      up. `min-h-62` is 248. With a stray line, the sheet —which on
      the phone hangs from the bottom edge— grew 230px when the
      response arrived and everything inside jumped up: Lighthouse measured it
      as a shift of 0.199. If the box changes height, this
      does too.
    */
    return (
      <p className="flex min-h-62 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t('transactions.supports.searching')}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <GalleryPreview g={g} />

      {/*
        ── No thumbnail row ──────────────────────────────────────────────────
        They were eight 104px squares under the paper, and with the sheet capped at
        720 they ate a third of the column to say something the paper already
        says: which one is being looked at. What they did —count, pick, add,
        remove— fits on the document itself and there it spends no height.
      */}
      {list.length === 0 && (
        <div className="flex min-h-0 flex-1">
          <DropZone
            isUploading={g.upload.isUploading}
            progress={g.upload.progress}
            isAlone
            onFiles={(a) => void g.upload.accept(a)}
          />
        </div>
      )}

      {g.upload.uploadError && (
        <p role="alert" className="text-xs text-destructive">
          {g.upload.uploadError}
        </p>
      )}

      <GalleryOverlays g={g} transactionId={transactionId} />
    </div>
  );
}

/** The receipt being shown, with its controls on top. */
function GalleryPreview({ g }: { g: Gallery }) {
  const { list, urls, failures } = g.files;
  // The one being shown, clamped: deleting the last one left the index
  // pointing at a receipt that no longer exists.
  const i = Math.min(g.activeIndex, list.length - 1);
  const enseñado = i >= 0 ? list[i] : undefined;
  if (!enseñado) return null;

  return (
    <FilePreview
      // The key is the RECEIPT and not its url: with the url, the frame unmounted
      // and mounted again when the file arrived, which is exactly the flicker that
      // this comes to remove.
      key={String(enseñado.id)}
      url={urls[String(enseñado.id)]}
      error={failures[String(enseñado.id)]}
      onRetry={g.files.retry}
      isImage={enseñado.mimeType.startsWith('image/')}
      // Here there IS a full-screen lightbox —the receipt already exists on the
      // server, with its download and its zoom—, so the preview is
      // also the door.
      onOpen={() => g.setEnlargedIndex(i)}
      actions={
        <>
          <SupportPager index={i} total={list.length} onGo={g.setActiveIndex} />

          <OverlayButton
            label={t('transactions.supports.addAnother')}
            onClick={() => g.setIsAdding(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </OverlayButton>

          {/* Deleting asks first: it is the only thing in this bar that cannot be
              undone. */}
          <OverlayButton
            label={t('transactions.supports.deleteThis')}
            onClick={() => g.setIsDeleting(enseñado)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </OverlayButton>
        </>
      }
    />
  );
}

/** What opens on top of the gallery: delete, upload and the lightbox. */
function GalleryOverlays({ g, transactionId }: { g: Gallery; transactionId: number }) {
  const { list, urls, failures } = g.files;

  return (
    <>
      <ConfirmSupportDeletion
        transactionId={transactionId}
        receipt={g.isDeleting}
        onCancel={() => g.setIsDeleting(null)}
        onDeleted={() => {
          g.setIsDeleting(null);
          // If the last one in the row goes, the previous one is shown.
          g.setActiveIndex((n) => Math.max(0, Math.min(n, list.length - 2)));
        }}
      />

      {g.isAdding && (
        <UploadPanel
          isUploading={g.upload.isUploading}
          progress={g.upload.progress}
          onFiles={(a) => void g.upload.accept(a)}
          onClose={() => g.setIsAdding(false)}
        />
      )}

      {g.enlargedIndex !== null && (
        <Lightbox
          transactionId={transactionId}
          list={list}
          urls={urls}
          errors={failures}
          onRetry={g.files.retry}
          index={Math.min(g.enlargedIndex, list.length - 1)}
          onGoTo={g.setEnlargedIndex}
          onClose={() => g.setEnlargedIndex(null)}
        />
      )}
    </>
  );
}
