import { FileWarning } from 'lucide-react';
import { type CSSProperties, useEffect, useEffectEvent, useRef, useState } from 'react';

import { drawPdfPage } from '@/shared/lib/pdf';
import { cn } from '@/shared/lib/utils';

/**
 * La primera página de un PDF, pintada en un lienzo.
 *
 * Se dibuja más grande que su caja y se encoge por CSS: en una pantalla
 * retina, dibujarla al tamaño de la caja deja un texto borroso que parece un
 * escaneo malo cuando el escaneo está bien.
 */
export function PdfCanvas({
  url,
  fit = 'cover',
  width = 240,
  onResize,
  style,
}: {
  url: string;
  /**
   * `cover` recorta por arriba; `contain` enseña la hoja entera.
   *
   * En una miniatura de 104px recortar es lo correcto: lo que distingue un
   * recibo de otro es el membrete. En una previsualización que existe para
   * COMPROBAR una cifra, recortar esconde justo lo que se viene a leer, que
   * casi nunca está en la cabecera.
   */
  fit?: 'cover' | 'contain';
  /** A cuántos píxeles se dibuja la página. Más, para verla grande. */
  width?: number;
  /** El tamaño real del dibujo, para quien necesite encuadrarlo. */
  onResize?: (width: number, height: number) => void;
  /** Si se pasa, el lienzo se mide por aquí en vez de llenar su caja. */
  style?: CSSProperties;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hasFailed, setHasFailed] = useState(false);

  // El aviso del tamaño como evento de efecto: en las dependencias haría que
  // el PDF se volviera a dibujar en cada render del padre. `useEffectEvent`
  // da una función estable que llama siempre a la versión más reciente sin
  // ser dependencia. Antes era una ref escrita durante el render, que hace lo
  // mismo a mano y es lo que la regla de los refs prohíbe.
  const reportSize = useEffectEvent((width: number, height: number) => onResize?.(width, height));

  useEffect(() => {
    let isAlive = true;
    // Se lee con una función: el análisis de tipos no ve que la limpieza lo
    // apaga mientras se espera, y daría cada comprobación por inútil.
    const isStillAlive = (): boolean => isAlive;

    drawPdfPage({
      url,
      page: 1,
      scale: (pageWidth) => width / pageWidth,
      canvas: () => canvas.current,
      isAlive: isStillAlive,
    })
      .then((drawing) => {
        if (drawing && isStillAlive()) reportSize(drawing.width, drawing.height);
      })
      .catch(() => {
        if (isStillAlive()) setHasFailed(true);
      });

    return () => {
      isAlive = false;
    };
  }, [url, width]);

  if (hasFailed) return <FileWarning className="size-6 text-muted-foreground" aria-hidden="true" />;

  if (style) return <canvas ref={canvas} style={style} aria-hidden="true" />;

  return (
    <canvas
      ref={canvas}
      className={cn('size-full', fit === 'cover' ? 'object-cover object-top' : 'object-contain')}
      aria-hidden="true"
    />
  );
}
