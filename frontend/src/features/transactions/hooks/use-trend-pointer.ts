import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { CANVAS_HEIGHT, xAt, yAt } from '@/features/transactions/model/trend';

interface Size {
  width: number;
  height: number;
}

/**
 * Qué punto de la gráfica se está señalando —con el dedo, el puntero o las
 * flechas— y dónde va la tarjeta que lo explica.
 */
export function useTrendPointer(total: number) {
  const canvas = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  /** El tamaño del lienzo en píxeles, para colocar la tarjeta sin que se salga. */
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const [cardSize, setCardSize] = useState<Size>({ width: 0, height: 0 });

  // Se mide DESPUÉS de pintar y antes de que el navegador dibuje: midiendo en
  // el render la tarjeta todavía no existe, y midiendo en un efecto normal se
  // vería un fotograma con la tarjeta en el sitio equivocado.
  useLayoutEffect(() => {
    if (!card.current) return;
    const { offsetWidth, offsetHeight } = card.current;
    setCardSize((previous) =>
      previous.width === offsetWidth && previous.height === offsetHeight
        ? previous
        : { width: offsetWidth, height: offsetHeight },
    );
  }, [active]);

  /** El punto más cercano al dedo o al puntero. */
  function point(clientX: number): void {
    const size = canvas.current?.getBoundingClientRect();
    if (!size || size.width === 0) return;

    setBox({ width: size.width, height: size.height });
    const fraction = (clientX - size.left) / size.width;
    const index = Math.round(fraction * (total - 1));
    setActive(Math.min(total - 1, Math.max(0, index)));
  }

  function withKeyboard(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();

    // Con el teclado no hay puntero, así que la medida hay que tomarla aquí.
    const size = canvas.current?.getBoundingClientRect();
    if (size) setBox({ width: size.width, height: size.height });

    const step = e.key === 'ArrowLeft' ? -1 : 1;
    const from = active ?? (step === 1 ? -1 : total);
    setActive(Math.min(total - 1, Math.max(0, from + step)));
  }

  return { canvas, card, active, setActive, box, cardSize, point, withKeyboard };
}

/**
 * Dónde va la tarjeta.
 *
 * Al lado del puntero, a doce píxeles, y saltando al otro lado cuando no
 * cabe: pegada a un extremo fijo obliga a mirar a otra parte para leer el
 * dato del punto que se está señalando, y siguiendo al puntero sin más se
 * sale del gráfico en los bordes.
 */
export function cardPosition({
  index,
  total,
  value,
  ceiling,
  box,
  cardSize,
}: {
  index: number;
  total: number;
  value: number;
  ceiling: number;
  box: Size;
  cardSize: Size;
}): { left: number; top: number } {
  const px = (xAt(index, total) / 100) * box.width;
  const py = (yAt(value, ceiling) / CANVAS_HEIGHT) * box.height;
  const MARGIN = 12;

  const canFitRight = px + MARGIN + cardSize.width <= box.width;
  const left = canFitRight ? px + MARGIN : Math.max(0, px - MARGIN - cardSize.width);
  const top = Math.min(
    Math.max(0, py - cardSize.height / 2),
    Math.max(0, box.height - cardSize.height),
  );

  return { left, top };
}
