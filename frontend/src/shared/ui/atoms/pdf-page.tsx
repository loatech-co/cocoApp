import { FileWarning, Loader2 } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { drawPdfPage } from '@/shared/lib/pdf';

/** The width of a sheet at 100 %: a letter page readable on a laptop without zooming. */
export const PAGE_WIDTH = 620;

interface PdfPageProps {
  url: string;
  page: number;
  scale: number;
  onPageCount: (n: number) => void;
}

/** Draws the page on the canvas every time the document, the page or the scale changes. */
function usePdfPageDrawing(
  canvas: RefObject<HTMLCanvasElement | null>,
  { url, page, scale, onPageCount }: PdfPageProps,
): { hasFailed: boolean; isPainting: boolean } {
  const [hasFailed, setHasFailed] = useState(false);
  const [isPainting, setIsPainting] = useState(true);

  // «Painting» from the first render of each change, not a frame later:
  // it is state derived from the document, the page or the scale having changed.
  useOnChange([url, page, scale], () => setIsPainting(true));

  useEffect(() => {
    let isAlive = true;
    // It is read through a function: type analysis does not see that the cleanup
    // turns it off while waiting, and would flag every check as useless.
    const isStillAlive = (): boolean => isAlive;

    drawPdfPage({
      url,
      page,
      // At TWICE the pixels that are shown: it is what keeps it sharp
      // on a retina screen.
      scale: (pageWidth) => ((PAGE_WIDTH * scale) / pageWidth) * 2,
      canvas: () => canvas.current,
      isAlive: isStillAlive,
      onPages: onPageCount,
    })
      .then((drawing) => {
        if (drawing && isStillAlive()) setIsPainting(false);
      })
      .catch(() => {
        if (isStillAlive()) {
          setHasFailed(true);
          setIsPainting(false);
        }
      });

    return () => {
      isAlive = false;
    };
  }, [canvas, url, page, scale, onPageCount]);

  return { hasFailed, isPainting };
}

/**
 * A PDF page drawn at the size the zoom asks for.
 *
 * It is REDRAWN when zooming instead of stretching the canvas with CSS: a PDF is
 * vector, so redrawing it gives sharp text at any size, while
 * stretching a bitmap gives exactly the look one fears when
 * zooming into a receipt —that of a bad scan—.
 *
 * It sits over the dark scrim of a full-screen viewer: that is why its ink
 * is the room's and not the page's.
 */
export function PdfPage({ url, page, scale, onPageCount }: PdfPageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { hasFailed, isPainting } = usePdfPageDrawing(canvas, { url, page, scale, onPageCount });

  if (hasFailed) {
    return (
      <p className="flex items-center gap-2 self-center text-sm text-sala-tinta/80">
        <FileWarning className="size-5" aria-hidden="true" />
        {t('ui.pdf.drawFailed')}
      </p>
    );
  }

  return (
    <>
      {isPainting && (
        <Loader2
          className="absolute size-6 animate-spin self-center text-sala-tinta/70"
          aria-hidden="true"
        />
      )}
      {/* The canvas is drawn at twice the pixels and shown at half: it is what
          keeps it sharp on a retina screen. */}
      <canvas
        ref={canvas}
        className="h-fit max-w-none rounded-lg bg-white shadow-2xl"
        style={{ width: PAGE_WIDTH * scale }}
      />
    </>
  );
}
