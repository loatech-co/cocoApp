import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ReceiptFailure } from '@/features/transactions/model/receipts';
import { type Receipt } from '@/shared/api/generated/model';
import { PAGE_WIDTH, PdfPage } from '@/shared/ui/atoms/pdf-page';

import { ConfirmReceiptDeletion } from './confirm-receipt-deletion';
import { UnavailableReceipt } from './receipt-unavailable';
import {
  ViewerArrow,
  ViewerControls,
  ViewerHeader,
  useViewerZoom,
} from './receipt-viewer-controls';

/** Escape closes, the arrows move between receipts, `+` and `-` zoom. */
function useViewerKeys(
  index: number,
  total: number,
  onGoTo: (i: number) => void,
  onClose: () => void,
  changeZoom: (step: number) => void,
): void {
  useEffect(() => {
    const onPress = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onGoTo(index - 1);
      else if (e.key === 'ArrowRight' && index < total - 1) onGoTo(index + 1);
      else if (e.key === '+' || e.key === '=') changeZoom(1);
      else if (e.key === '-') changeZoom(-1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onPress);
    return () => document.removeEventListener('keydown', onPress);
  }, [index, total, onGoTo, onClose, changeZoom]);
}

interface ViewerProps {
  transactionId: number;
  list: Receipt[];
  urls: Record<string, string>;
  /** Why each one cannot be seen, if it cannot. See `ReceiptFailure`. */
  errors: Readonly<Record<string, ReceiptFailure>>;
  onRetry: () => void;
  index: number;
  onGoTo: (i: number) => void;
  onClose: () => void;
}

/**
 * The receipts lightbox: the receipt at a readable size.
 *
 * ── Why the PDF is drawn too ────────────────────────────────────────────────
 * An `<iframe>` with the browser's viewer shows the PDF, but brings its own
 * bar, its own zoom and its own language, and on top of that it changes with the browser
 * and the system. Next to an image, which is enlarged with the buttons here,
 * the same gesture did two different things depending on which receipt it touched.
 *
 * Drawing the page on a canvas, both are the same: a bitmap that
 * this component enlarges, pans and downloads the same way. It costs a pdf.js
 * render and in exchange the viewer always behaves the same.
 */
export function Lightbox(props: ViewerProps) {
  const { list, index, onGoTo, onClose } = props;
  const [isConfirming, setIsConfirming] = useState(false);
  const receipt = list[index];
  const vista = useViewerZoom(index);
  useViewerKeys(index, list.length, onGoTo, onClose, vista.changeZoom);

  if (receipt === undefined) return null;
  const url = props.urls[String(receipt.id)];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={receipt.fileName}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      // Above the transaction modal, which is at z-50.
      className="fixed inset-0 z-[60] flex flex-col bg-stage/90 p-3 backdrop-blur-sm sm:p-6"
    >
      <ViewerHeader
        receipt={receipt}
        index={index}
        total={list.length}
        url={url}
        onDelete={() => setIsConfirming(true)}
        onClose={onClose}
      />

      {/* ── The receipt ──────────────────────────────────────────────── */}
      <ViewerStage
        receipt={receipt}
        url={url}
        error={props.errors[String(receipt.id)]}
        onRetry={props.onRetry}
        scale={vista.scale}
        page={vista.page}
        onPages={vista.setPages}
        index={index}
        total={list.length}
        onGoTo={onGoTo}
      />

      <ViewerControls vista={vista} />

      {/* Same layer as the lightbox and AFTER it in the tree: with the same z-index,
          the later one wins, so the dialog stays on top. */}
      <DeleteFromViewer
        {...props}
        receipt={isConfirming ? receipt : null}
        onFinish={() => setIsConfirming(false)}
      />
    </div>
  );
}

/**
 * The slot is DARK and the page floats on top.
 *
 * Before, the whole container was white, so a 620px receipt on a
 * wide screen left two huge white strips on the sides: in an app with a
 * dark green background, and at night, that is blinding. What is white has to be the
 * paper and nothing else, which is also how a document looks in any viewer.
 *
 * `overflow-auto`: enlarged, the receipt is browsed with the scroll
 * bar. It is what the browser already knows how to do and there is no need to reinvent
 * dragging.
 */
interface ViewerStageProps {
  receipt: Receipt;
  url: string | undefined;
  error: ReceiptFailure | undefined;
  onRetry: () => void;
  scale: number;
  page: number;
  onPages: (n: number) => void;
  index: number;
  total: number;
  onGoTo: (i: number) => void;
}

function ViewerStage(props: ViewerStageProps) {
  const { index, total, onGoTo } = props;

  return (
    <div className="flex min-h-0 flex-1 gap-2">
      {total > 1 && (
        <ViewerArrow
          direction="anterior"
          disabled={index === 0}
          onClick={() => onGoTo(index - 1)}
        />
      )}

      <ViewerSheet {...props} />

      {total > 1 && (
        <ViewerArrow
          direction="siguiente"
          disabled={index === total - 1}
          onClick={() => onGoTo(index + 1)}
        />
      )}
    </div>
  );
}

function ViewerSheet({ receipt, url, error, onRetry, scale, page, onPages }: ViewerStageProps) {
  return (
    <div className="relative flex min-w-0 flex-1 justify-center overflow-auto rounded-lg bg-stage/25 p-3 sm:p-6">
      {error ? (
        <div className="flex w-full items-center justify-center">
          <UnavailableReceipt error={error} onRetry={onRetry} isDark />
        </div>
      ) : !url ? (
        <div className="flex w-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-stage-ink/70" aria-hidden="true" />
        </div>
      ) : receipt.mimeType.startsWith('image/') ? (
        <img
          src={url}
          alt={receipt.fileName}
          // The SAME width as a PDF page: if an image measured something
          // else, the zoom button would do two different things depending on which
          // receipt was open.
          className="h-fit max-w-none rounded-lg bg-white shadow-2xl"
          style={{ width: PAGE_WIDTH * scale }}
        />
      ) : (
        <PdfPage url={url} page={page} scale={scale} onPageCount={onPages} />
      )}
    </div>
  );
}

/** Delete the receipt being viewed, and what to show afterward. */
function DeleteFromViewer({
  transactionId,
  list,
  index,
  onGoTo,
  onClose,
  receipt,
  onFinish,
}: ViewerProps & { receipt: Receipt | null; onFinish: () => void }) {
  return (
    <ConfirmReceiptDeletion
      transactionId={transactionId}
      receipt={receipt}
      onCancel={onFinish}
      onDeleted={() => {
        onFinish();
        // It was the only one: there is nothing left to show.
        if (list.length === 1) onClose();
        else if (index === list.length - 1) onGoTo(index - 1);
      }}
    />
  );
}
