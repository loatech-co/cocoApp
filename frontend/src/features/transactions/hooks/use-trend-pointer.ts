import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { ALTO_LIENZO, equis, ye } from '@/features/transactions/model/trend';

interface Tamano {
  ancho: number;
  alto: number;
}

/**
 * Qué punto de la gráfica se está señalando —con el dedo, el puntero o las
 * flechas— y dónde va la tarjeta que lo explica.
 */
export function useTrendPointer(total: number) {
  const lienzo = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState<number | null>(null);
  /** El tamaño del lienzo en píxeles, para colocar la tarjeta sin que se salga. */
  const [caja, setCaja] = useState<Tamano>({ ancho: 0, alto: 0 });
  const [tamTarjeta, setTamTarjeta] = useState<Tamano>({ ancho: 0, alto: 0 });

  // Se mide DESPUÉS de pintar y antes de que el navegador dibuje: midiendo en
  // el render la tarjeta todavía no existe, y midiendo en un efecto normal se
  // vería un fotograma con la tarjeta en el sitio equivocado.
  useLayoutEffect(() => {
    if (!tarjeta.current) return;
    const { offsetWidth, offsetHeight } = tarjeta.current;
    setTamTarjeta((previo) =>
      previo.ancho === offsetWidth && previo.alto === offsetHeight
        ? previo
        : { ancho: offsetWidth, alto: offsetHeight },
    );
  }, [activo]);

  /** El punto más cercano al dedo o al puntero. */
  function apuntar(clientX: number): void {
    const medida = lienzo.current?.getBoundingClientRect();
    if (!medida || medida.width === 0) return;

    setCaja({ ancho: medida.width, alto: medida.height });
    const fraccion = (clientX - medida.left) / medida.width;
    const indice = Math.round(fraccion * (total - 1));
    setActivo(Math.min(total - 1, Math.max(0, indice)));
  }

  function conTeclado(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();

    // Con el teclado no hay puntero, así que la medida hay que tomarla aquí.
    const medida = lienzo.current?.getBoundingClientRect();
    if (medida) setCaja({ ancho: medida.width, alto: medida.height });

    const paso = e.key === 'ArrowLeft' ? -1 : 1;
    const desde = activo ?? (paso === 1 ? -1 : total);
    setActivo(Math.min(total - 1, Math.max(0, desde + paso)));
  }

  return { lienzo, tarjeta, activo, setActivo, caja, tamTarjeta, apuntar, conTeclado };
}

/**
 * Dónde va la tarjeta.
 *
 * Al lado del puntero, a doce píxeles, y saltando al otro lado cuando no
 * cabe: pegada a un extremo fijo obliga a mirar a otra parte para leer el
 * dato del punto que se está señalando, y siguiendo al puntero sin más se
 * sale del gráfico en los bordes.
 */
export function sitioDeLaTarjeta({
  indice,
  total,
  valor,
  techo,
  caja,
  tamTarjeta,
}: {
  indice: number;
  total: number;
  valor: number;
  techo: number;
  caja: Tamano;
  tamTarjeta: Tamano;
}): { left: number; top: number } {
  const px = (equis(indice, total) / 100) * caja.ancho;
  const py = (ye(valor, techo) / ALTO_LIENZO) * caja.alto;
  const MARGEN = 12;

  const cabeADerecha = px + MARGEN + tamTarjeta.ancho <= caja.ancho;
  const left = cabeADerecha ? px + MARGEN : Math.max(0, px - MARGEN - tamTarjeta.ancho);
  const top = Math.min(
    Math.max(0, py - tamTarjeta.alto / 2),
    Math.max(0, caja.alto - tamTarjeta.alto),
  );

  return { left, top };
}
