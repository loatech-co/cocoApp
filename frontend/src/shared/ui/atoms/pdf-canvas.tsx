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
export function LienzoPdf({
  url,
  ajuste = 'cover',
  ancho = 240,
  onTamano,
  estilo,
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
  ajuste?: 'cover' | 'contain';
  /** A cuántos píxeles se dibuja la página. Más, para verla grande. */
  ancho?: number;
  /** El tamaño real del dibujo, para quien necesite encuadrarlo. */
  onTamano?: (ancho: number, alto: number) => void;
  /** Si se pasa, el lienzo se mide por aquí en vez de llenar su caja. */
  estilo?: CSSProperties;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [fallo, setFallo] = useState(false);

  // El aviso del tamaño como evento de efecto: en las dependencias haría que
  // el PDF se volviera a dibujar en cada render del padre. `useEffectEvent`
  // da una función estable que llama siempre a la versión más reciente sin
  // ser dependencia. Antes era una ref escrita durante el render, que hace lo
  // mismo a mano y es lo que la regla de los refs prohíbe.
  const avisarTamano = useEffectEvent((ancho: number, alto: number) => onTamano?.(ancho, alto));

  useEffect(() => {
    let vivo = true;
    // Se lee con una función: el análisis de tipos no ve que la limpieza lo
    // apaga mientras se espera, y daría cada comprobación por inútil.
    const sigueVivo = (): boolean => vivo;

    drawPdfPage({
      url,
      page: 1,
      scale: (anchoDeLaHoja) => ancho / anchoDeLaHoja,
      canvas: () => lienzo.current,
      isAlive: sigueVivo,
    })
      .then((dibujo) => {
        if (dibujo && sigueVivo()) avisarTamano(dibujo.width, dibujo.height);
      })
      .catch(() => {
        if (sigueVivo()) setFallo(true);
      });

    return () => {
      vivo = false;
    };
  }, [url, ancho]);

  if (fallo) return <FileWarning className="size-6 text-muted-foreground" aria-hidden="true" />;

  if (estilo) return <canvas ref={lienzo} style={estilo} aria-hidden="true" />;

  return (
    <canvas
      ref={lienzo}
      className={cn('size-full', ajuste === 'cover' ? 'object-cover object-top' : 'object-contain')}
      aria-hidden="true"
    />
  );
}
