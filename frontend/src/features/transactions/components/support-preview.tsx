import { Loader2, Maximize2, Minus, Plus } from 'lucide-react';
import { type CSSProperties, type ReactNode, useRef } from 'react';

import type { ReceiptFailure } from '@/features/transactions/model/supports';
import { t } from '@/shared/lib/i18n';
import { usePanZoom } from '@/shared/lib/pan-zoom';
import { cn } from '@/shared/lib/utils';
import { PdfCanvas } from '@/shared/ui/atoms/pdf-canvas';
import { OverlayButton, ControlReadout } from '@/shared/ui/molecules/overlay-control';

import { UnavailableReceipt } from './support-unavailable';

/** The zoom steps, as multiples of the scale that fills the box. */
const PREVIEW_STEPS = [1, 1.5, 2, 3];

interface PreviewProps {
  /**
   * The document. While it is not there, the empty frame shows with its spinner.
   *
   * ── Why the frame goes FIRST ──────────────────────────────────────────────
   * The receipt of a saved transaction is downloaded: there is a moment —short for
   * an image, long for a multi-page PDF— in which there is nothing to
   * draw. Without a frame, the column stays empty and a block suddenly appears
   * that pushes what is below; with it, the spot is already made and the only thing that
   * changes is what is inside.
   *
   * It is the same reason a table shows its rows in gray before
   * having data: what cannot change size is the page.
   */
  url?: string | undefined;
  /**
   * The document is not being shown, and why.
   *
   * Without this the same spinner as while waiting was drawn, and a receipt
   * that was never going to arrive spun forever: whoever is looking cannot tell
   * «está tardando» from «no está», which call for different things.
   */
  error?: ReceiptFailure | undefined;
  /** It only does something with `sin-cargar`: what is missing does not come back by retrying. */
  onRetry?: (() => void) | undefined;
  isImage: boolean;
  /**
   * Opens the full-screen lightbox, if there is one.
   *
   * Only an already saved receipt has it: the one still waiting for the
   * transaction to be saved does not exist anywhere that can be opened. Without
   * this, the button would appear in both places and in one it would do nothing.
   */
  onOpen?: (() => void) | undefined;
  /**
   * What can be done with THIS document: delete it, add another, go to the
   * next one.
   *
   * They are here since there are no thumbnails. The thumbnail row was the one that
   * said how many documents there are, which one is being viewed and where one is added or
   * removed; without it, all that has to fit over the paper or
   * it disappears.
   */
  actions?: ReactNode;
}

/**
 * The receipt, large and pannable.
 *
 * ── Why it fills the box and does not fit whole ─────────────────────────────
 * Because this column exists precisely to read the total. See `usePanZoom`,
 * which is what frames it and clamps the drag.
 *
 * ── Why dragging and not scroll bars ────────────────────────────────────────
 * Because it is a document, not a page: the gesture with which everyone
 * moves a plan or a map is grabbing it.
 */
export function FilePreview({ url, error, onRetry, isImage, onOpen, actions }: PreviewProps) {
  /*
    The zoom multiplies the scale that already FILLS the box, so 100 % is the
    document covering the frame and not its natural size.

    It does not go below 100 % on purpose: below it empty strips would appear on the
    sides, and a preview with gaps reads as an assembly error.
    To see the whole page there is the full-screen lightbox of the already
    saved transaction.
  */
  const marco = useRef<HTMLDivElement>(null);
  const vista = usePanZoom(marco, PREVIEW_STEPS);

  return (
    <div
      ref={marco}
      // `touch-action: none` so the finger moves the document and does not scroll
      // the whole sheet behind it.
      className={cn(
        /*
          ── The height is set by the COLUMN, not by this frame ────────────
          It had a fixed 480 and then 350, and a fixed height is wrong on both
          sides: it left a hand's width of empty space between the paper and the foot of its
          column, and in a short window it ate the room of everything else.

          With `flex-1` it measures what its column has left over, which is exactly
          what the fields column measures: both are cells of the same
          grid row. The document reframes itself —the frame is
          measured with a `ResizeObserver` and the scale comes from there— so growing
          costs it nothing.

          The floor of 220 (`min-h-55`) is for the case where there is no height to share:
          a forty-pixel preview shows nothing and the
          `ResizeObserver` would be left measuring a strip.
        */
        'relative min-h-55 flex-1 touch-none select-none overflow-hidden rounded-lg bg-card ring-1 ring-border',
        vista.canPan && (vista.isDragging ? 'cursor-grabbing' : 'cursor-grab'),
      )}
      {...vista.handlers}
    >
      {/* The full-screen lightbox, at the top and in the corner opposite the
          zoom controls: they are two different things —one enlarges inside the
          frame, the other takes the document out of the frame— and together one would be pressed
          for the other. */}
      <PreviewActions onOpen={onOpen} actions={actions} />

      <PreviewZoom
        isVisible={Boolean(url)}
        zoom={vista.zoom}
        step={vista.step}
        onZoom={vista.setZoom}
      />

      <PreviewDocument
        url={url}
        error={error}
        onRetry={onRetry}
        isImage={isImage}
        framing={vista.framing}
        onResize={(width, height) => vista.setNatural({ width, height })}
      />
    </div>
  );
}

/**
 * The zoom controls, on a dark pill: on top of a receipt —which is
 * white— any light control disappears.
 *
 * Only with the document loaded: enlarging an empty frame does nothing, and a
 * control that does not respond reads as a failure.
 */
function PreviewZoom({
  isVisible,
  zoom,
  step,
  onZoom,
}: {
  isVisible: boolean;
  zoom: number;
  step: number;
  onZoom: (change: (zoom: number) => number) => void;
}) {
  return (
    <div
      data-zoom-controls=""
      hidden={!isVisible}
      className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-sala/75 p-0.5"
    >
      <OverlayButton
        label={t('transactions.supports.zoomOut')}
        disabled={zoom === 0}
        onClick={() => onZoom((z) => Math.max(0, z - 1))}
      >
        <Minus className="size-4" aria-hidden="true" />
      </OverlayButton>
      <ControlReadout
        width="preview"
        title={t('transactions.supports.resetZoom')}
        onClick={() => onZoom(() => 0)}
      >
        {Math.round(step * 100)} %
      </ControlReadout>
      <OverlayButton
        label={t('transactions.supports.zoomIn')}
        disabled={zoom === PREVIEW_STEPS.length - 1}
        onClick={() => onZoom((z) => Math.min(PREVIEW_STEPS.length - 1, z + 1))}
      >
        <Plus className="size-4" aria-hidden="true" />
      </OverlayButton>
    </div>
  );
}

/** What is inside the frame: the failure, the spinner, the image or the PDF. */
function PreviewDocument({
  url,
  error,
  onRetry,
  isImage,
  framing,
  onResize,
}: {
  url: string | undefined;
  error: ReceiptFailure | undefined;
  onRetry: (() => void) | undefined;
  isImage: boolean;
  framing: CSSProperties;
  onResize: (width: number, height: number) => void;
}) {
  if (error) return <UnavailableReceipt error={error} onRetry={onRetry} />;

  if (!url) {
    return (
      // The spinner in the center of the frame, with the same gray as the rest of
      // what is waiting in this app.
      <span
        className="grid size-full place-items-center"
        role="status"
        aria-label={t('transactions.supports.loading')}
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </span>
    );
  }

  if (!isImage) {
    // At 1400 and not 240: this is looked at to read a figure, and a
    // thumbnail's size leaves it blurry.
    return <PdfCanvas url={url} width={1400} onResize={onResize} style={framing} />;
  }

  return (
    <img
      src={url}
      alt=""
      draggable={false}
      /*
        `max-w-none`, and it is not cosmetic: it is what distorted the image.

        Tailwind's preflight declares `img, video { max-width: 100%;
        height: auto }` so that no stray image spills out of its column.
        Here that is exactly the opposite of what is needed: the framing computes
        a width and a height that ALREADY keep the aspect ratio —the scale is the same
        for both axes— and paints them in the `style`. The preflight's
        `max-width` beats the inline width —a max always wins— but does not
        touch the height, so the image kept the frame's width and the
        full height: stretched.

        It did not happen to the PDF because a `<canvas>` paints it, and that
        preflight rule is only for `img` and `video`. Hence it looked like it
        failed with «some images».
      */
      className="max-w-none"
      onLoad={(e) => onResize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      style={framing}
    />
  );
}

/** What is done with the document, top right, and the lightbox if there is one. */
function PreviewActions({ onOpen, actions }: Pick<PreviewProps, 'onOpen' | 'actions'>) {
  if (onOpen === undefined && !actions) return null;

  return (
    <div
      data-zoom-controls=""
      className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-full bg-sala/75 p-0.5"
    >
      {actions}
      {onOpen && (
        <OverlayButton label={t('transactions.supports.enlarge')} onClick={onOpen}>
          <Maximize2 className="size-4" aria-hidden="true" />
        </OverlayButton>
      )}
    </div>
  );
}
