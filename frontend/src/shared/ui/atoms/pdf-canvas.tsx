import { FileWarning } from 'lucide-react';
import { type CSSProperties, useEffect, useEffectEvent, useRef, useState } from 'react';

import { drawPdfPage } from '@/shared/lib/pdf';
import { cn } from '@/shared/lib/utils';

/**
 * The first page of a PDF, painted on a canvas.
 *
 * It is drawn larger than its box and shrunk by CSS: on a retina
 * screen, drawing it at the box size leaves blurry text that looks like a
 * bad scan when the scan is fine.
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
   * `cover` crops from the top; `contain` shows the whole sheet.
   *
   * In a 104px thumbnail cropping is right: what tells one
   * receipt from another is the letterhead. In a preview that exists to
   * CHECK a figure, cropping hides exactly what one came to read, which
   * is almost never in the header.
   */
  fit?: 'cover' | 'contain';
  /** How many pixels the page is drawn at. More, to see it large. */
  width?: number;
  /** The real size of the drawing, for whoever needs to frame it. */
  onResize?: (width: number, height: number) => void;
  /** If passed, the canvas is sized by this instead of filling its box. */
  style?: CSSProperties;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hasFailed, setHasFailed] = useState(false);

  // The size notification as an effect event: in the dependencies it would make
  // the PDF redraw on every render of the parent. `useEffectEvent`
  // gives a stable function that always calls the latest version without
  // being a dependency. It used to be a ref written during render, which does the
  // same by hand and is what the rule of refs forbids.
  const reportSize = useEffectEvent((width: number, height: number) => onResize?.(width, height));

  useEffect(() => {
    let isAlive = true;
    // It is read through a function: type analysis does not see that the cleanup
    // turns it off while waiting, and would flag every check as useless.
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
