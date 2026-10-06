import { ChevronLeft, ChevronRight, Download, Minus, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { type Receipt } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { OverlayButton, ControlReadout } from '@/shared/ui/molecules/overlay-control';

/** Los saltos del zoom. Fijos y pocos: un control continuo pide precisión que
    nadie quiere darle a un recibo. */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
/** El índice del 100 %, por nombre: `ZOOMS.indexOf(2)` es el 200 %, no el 2º. */
const NORMAL = ZOOMS.indexOf(1);

/** El zoom y la página del pase, que vuelven a empezar con cada soporte. */
export function useViewerZoom(index: number) {
  const [zoom, setZoom] = useState(NORMAL);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Cambiar de soporte reinicia el zoom y la página: seguir en la página 3 de
  // un recibo de una sola hoja deja el visor en blanco.
  useOnChange([index], () => {
    setZoom(NORMAL);
    setPage(1);
    setPages(1);
  });

  const changeZoom = useCallback(
    (step: number) => setZoom((z) => Math.min(ZOOMS.length - 1, Math.max(0, z + step))),
    [],
  );

  // `zoom` siempre está dentro de `ZOOMS`: lo recortan `cambiarZoom` y `NORMAL`.
  const scale = ZOOMS[zoom] ?? 1;

  return { zoom, setZoom, scale, changeZoom, page, setPage, pages, setPages };
}

/** El nombre, la posición y el peso del soporte, y lo que se hace con él entero. */
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
        <p className="truncate text-sm font-medium text-sala-tinta">{receipt.fileName}</p>
        <p className="tabular text-xs text-sala-tinta/60">
          {total > 1 && t('transactions.supports.position', { n: index + 1, total })}
          {t('transactions.supports.kilobytes', { size: (receipt.sizeBytes / 1024).toFixed(0) })}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Descargar es un enlace, no un botón con JavaScript: el navegador
            ya sabe guardar un archivo, y con `download` se guarda con su
            nombre de verdad y no con el uuid del almacén. */}
        {url && (
          <a
            href={url}
            download={receipt.fileName}
            title={t('transactions.supports.download')}
            aria-label={t('transactions.supports.downloadNamed', { fileName: receipt.fileName })}
            className="flex size-9 items-center justify-center rounded-lg text-sala-tinta transition-colors hover:bg-sala-tinta/10"
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
        )}
        {/* Poder quitar lo que se acaba de subir por error. Sin esto, una
            foto movida se queda para siempre colgando del movimiento. */}
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

/** Una flecha a un lado del recibo, para pasar al soporte de al lado. */
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
  /** Un paso (`1`, `-1`) o `null` para volver al tamaño normal. */
  onZoom: (step: number | null) => void;
}

interface PageProps {
  page: number;
  pages: number;
  onPage: (change: (page: number) => number) => void;
}

/** El zoom, y las páginas cuando el PDF tiene más de una. */
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
    <div className="flex items-center gap-1 rounded-full bg-sala-tinta/10 px-1">
      <OverlayButton
        onClick={() => onZoom(-1)}
        disabled={zoom === 0}
        label={t('transactions.supports.zoomOut')}
      >
        <Minus className="size-4" aria-hidden="true" />
      </OverlayButton>
      {/* El porcentaje se pulsa para volver al tamaño normal: es donde todo el
          mundo intenta pulsar cuando se ha perdido ampliando. */}
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
    <div className="flex items-center gap-1 rounded-full bg-sala-tinta/10 px-1">
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
