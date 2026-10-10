import { ChevronLeft, ChevronRight, Download, Minus, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { type Receipt } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { OverlayButton, ControlReadout } from '@/shared/ui/molecules/overlay-control';

/** The zoom steps. Fixed and few: a continuous control asks for a precision
    nobody wants to give a receipt. */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
/** The index of 100 %, by name: `ZOOMS.indexOf(2)` is 200 %, not the 2nd. */
const NORMAL = ZOOMS.indexOf(1);

/** The lightbox's zoom and page, which start over with each receipt. */
export function useViewerZoom(index: number) {
  const [zoom, setZoom] = useState(NORMAL);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Switching receipts resets the zoom and the page: staying on page 3 of
  // a single-page receipt leaves the viewer blank.
  useOnChange([index], () => {
    setZoom(NORMAL);
    setPage(1);
    setPages(1);
  });

  const changeZoom = useCallback(
    (step: number) => setZoom((z) => Math.min(ZOOMS.length - 1, Math.max(0, z + step))),
    [],
  );

  // `zoom` is always inside `ZOOMS`: `changeZoom` and `NORMAL` clamp it.
  const scale = ZOOMS[zoom] ?? 1;

  return { zoom, setZoom, scale, changeZoom, page, setPage, pages, setPages };
}

/** The receipt's name, position and size, and what is done with it as a whole. */
export function ViewerHeader({
  receipt,
  index,
  total,
  url,
  onDelete,
  onClose,
}: {
  receipt: Receipt;
  index: number;
  total: number;
  url: string | undefined;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-stage-ink">{receipt.fileName}</p>
        <p className="tabular text-xs text-stage-ink/60">
          {total > 1 && t('transactions.supports.position', { n: index + 1, total })}
          {t('transactions.supports.kilobytes', { size: (receipt.sizeBytes / 1024).toFixed(0) })}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Downloading is a link, not a button with JavaScript: the browser
            already knows how to save a file, and with `download` it is saved with its
            real name and not with the storage uuid. */}
        {url && (
          <a
            href={url}
            download={receipt.fileName}
            title={t('transactions.supports.download')}
            aria-label={t('transactions.supports.downloadNamed', { fileName: receipt.fileName })}
            className="flex size-9 items-center justify-center rounded-lg text-stage-ink transition-colors hover:bg-stage-ink/10"
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
        )}
        {/* Being able to remove what was just uploaded by mistake. Without this, a
            blurry photo stays hanging from the transaction forever. */}
        <OverlayButton onClick={onDelete} label={t('transactions.supports.deleteTitle')}>
          <Trash2 className="size-4" aria-hidden="true" />
        </OverlayButton>
        <OverlayButton onClick={onClose} label={t('common.close')}>
          <X className="size-4" aria-hidden="true" />
        </OverlayButton>
      </div>
    </div>
  );
}

/** An arrow on one side of the receipt, to move to the receipt next to it. */
export function ViewerArrow({
  direction,
  disabled: isDisabled,
  onClick,
}: {
  direction: 'anterior' | 'siguiente';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <OverlayButton
      onClick={onClick}
      disabled={isDisabled}
      label={
        direction === 'anterior'
          ? t('transactions.supports.previousReceipt')
          : t('transactions.supports.nextReceipt')
      }
      className="self-center"
    >
      {direction === 'anterior' ? (
        <ChevronLeft className="size-5" aria-hidden="true" />
      ) : (
        <ChevronRight className="size-5" aria-hidden="true" />
      )}
    </OverlayButton>
  );
}

interface ZoomProps {
  zoom: number;
  scale: number;
  /** A step (`1`, `-1`) or `null` to go back to the normal size. */
  onZoom: (step: number | null) => void;
}

interface PageProps {
  page: number;
  pages: number;
  onPage: (change: (page: number) => number) => void;
}

/** The zoom, and the pages when the PDF has more than one. */
export function ViewerControls({ vista }: { vista: ReturnType<typeof useViewerZoom> }) {
  return (
    <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-3">
      <ZoomControls
        zoom={vista.zoom}
        scale={vista.scale}
        onZoom={(step) => (step === null ? vista.setZoom(NORMAL) : vista.changeZoom(step))}
      />
      {vista.pages > 1 && (
        <PageControls page={vista.page} pages={vista.pages} onPage={vista.setPage} />
      )}
    </div>
  );
}

function ZoomControls({ zoom, scale, onZoom }: ZoomProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-stage-ink/10 px-1">
      <OverlayButton
        onClick={() => onZoom(-1)}
        disabled={zoom === 0}
        label={t('transactions.supports.zoomOut')}
      >
        <Minus className="size-4" aria-hidden="true" />
      </OverlayButton>
      {/* The percentage is pressed to go back to the normal size: it is where
          everyone tries to press when they got lost zooming. */}
      <ControlReadout width="zoom" onClick={() => onZoom(null)}>
        {Math.round(scale * 100)} %
      </ControlReadout>
      <OverlayButton
        onClick={() => onZoom(1)}
        disabled={zoom === ZOOMS.length - 1}
        label={t('transactions.supports.zoomIn')}
      >
        <Plus className="size-4" aria-hidden="true" />
      </OverlayButton>
    </div>
  );
}

function PageControls({ page, pages, onPage }: PageProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-stage-ink/10 px-1">
      <OverlayButton
        onClick={() => onPage((p) => p - 1)}
        disabled={page === 1}
        label={t('transactions.supports.previousPage')}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </OverlayButton>
      <ControlReadout width="pages">
        {t('transactions.supports.pageShort', { page, pages })}
      </ControlReadout>
      <OverlayButton
        onClick={() => onPage((p) => p + 1)}
        disabled={page === pages}
        label={t('transactions.supports.nextPage')}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </OverlayButton>
    </div>
  );
}
