import { FileWarning, Loader2 } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { useAlCambiar } from '@/shared/lib/al-cambiar';
import { drawPdfPage } from '@/shared/lib/pdf';

/** El ancho de una hoja al 100 %: carta legible en un portátil sin ampliar. */
export const ANCHO_HOJA = 620;

interface PdfPageProps {
  url: string;
  pagina: number;
  escala: number;
  onPaginas: (n: number) => void;
}

/** Dibuja la página en el lienzo cada vez que cambia el documento, la página o la escala. */
function usePdfPageDrawing(
  lienzo: RefObject<HTMLCanvasElement | null>,
  { url, pagina, escala, onPaginas }: PdfPageProps,
): { fallo: boolean; pintando: boolean } {
  const [fallo, setFallo] = useState(false);
  const [pintando, setPintando] = useState(true);

  // «Pintando» desde el primer render de cada cambio, no un fotograma después:
  // es estado que se deriva de que cambió el documento, la página o la escala.
  useAlCambiar([url, pagina, escala], () => setPintando(true));

  useEffect(() => {
    let vivo = true;
    // Se lee con una función: el análisis de tipos no ve que la limpieza lo
    // apaga mientras se espera, y daría cada comprobación por inútil.
    const sigueVivo = (): boolean => vivo;

    drawPdfPage({
      url,
      page: pagina,
      // Al DOBLE de píxeles de los que se enseñan: es lo que lo deja nítido
      // en una pantalla retina.
      scale: (anchoDeLaHoja) => ((ANCHO_HOJA * escala) / anchoDeLaHoja) * 2,
      canvas: () => lienzo.current,
      isAlive: sigueVivo,
      onPages: onPaginas,
    })
      .then((dibujo) => {
        if (dibujo && sigueVivo()) setPintando(false);
      })
      .catch(() => {
        if (sigueVivo()) {
          setFallo(true);
          setPintando(false);
        }
      });

    return () => {
      vivo = false;
    };
  }, [lienzo, url, pagina, escala, onPaginas]);

  return { fallo, pintando };
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
export function PaginaPdf({ url, pagina, escala, onPaginas }: PdfPageProps) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const { fallo, pintando } = usePdfPageDrawing(lienzo, { url, pagina, escala, onPaginas });

  if (fallo) {
    return (
      <p className="flex items-center gap-2 self-center text-sm text-sala-tinta/80">
        <FileWarning className="size-5" aria-hidden="true" />
        No se pudo dibujar este PDF.
      </p>
    );
  }

  return (
    <>
      {pintando && (
        <Loader2
          className="absolute size-6 animate-spin self-center text-sala-tinta/70"
          aria-hidden="true"
        />
      )}
      {/* El lienzo se dibuja al doble de píxeles y se enseña a la mitad: es lo
          que lo deja nítido en una pantalla retina. */}
      <canvas
        ref={lienzo}
        className="h-fit max-w-none rounded-lg bg-white shadow-2xl"
        style={{ width: ANCHO_HOJA * escala }}
      />
    </>
  );
}
