import { FileWarning, Loader2 } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { useAlCambiar } from '@/shared/lib/al-cambiar';
import { t } from '@/shared/lib/i18n';
import { drawPdfPage } from '@/shared/lib/pdf';

/** El ancho de una hoja al 100 %: carta legible en un portátil sin ampliar. */
export const PAGE_WIDTH = 620;

interface PdfPageProps {
  url: string;
  page: number;
  scale: number;
  onPageCount: (n: number) => void;
}

/** Dibuja la página en el lienzo cada vez que cambia el documento, la página o la escala. */
function usePdfPageDrawing(
  canvas: RefObject<HTMLCanvasElement | null>,
  { url, page, scale, onPageCount }: PdfPageProps,
): { hasFailed: boolean; isPainting: boolean } {
  const [hasFailed, setHasFailed] = useState(false);
  const [isPainting, setIsPainting] = useState(true);

  // «Pintando» desde el primer render de cada cambio, no un fotograma después:
  // es estado que se deriva de que cambió el documento, la página o la escala.
  useAlCambiar([url, page, scale], () => setIsPainting(true));

  useEffect(() => {
    let isAlive = true;
    // Se lee con una función: el análisis de tipos no ve que la limpieza lo
    // apaga mientras se espera, y daría cada comprobación por inútil.
    const isStillAlive = (): boolean => isAlive;

    drawPdfPage({
      url,
      page,
      // Al DOBLE de píxeles de los que se enseñan: es lo que lo deja nítido
      // en una pantalla retina.
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
 * Una página de PDF dibujada al tamaño que pide el zoom.
 *
 * Se REDIBUJA al ampliar en vez de estirar el lienzo con CSS: un PDF es
 * vectorial, así que redibujarlo da texto nítido a cualquier tamaño, mientras
 * que estirar un mapa de bits da exactamente el aspecto que uno teme al
 * ampliar un recibo —el de un escaneo malo—.
 *
 * Va sobre el velo oscuro de un visor a pantalla completa: por eso su tinta
 * es la de la sala y no la de la página.
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
      {/* El lienzo se dibuja al doble de píxeles y se enseña a la mitad: es lo
          que lo deja nítido en una pantalla retina. */}
      <canvas
        ref={canvas}
        className="h-fit max-w-none rounded-lg bg-white shadow-2xl"
        style={{ width: PAGE_WIDTH * scale }}
      />
    </>
  );
}
