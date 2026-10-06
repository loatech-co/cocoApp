import { useState } from 'react';

import { t } from '@/shared/lib/i18n';

/**
 * Le pone nombre a una captura pegada.
 *
 * El portapapeles no entrega nombres: lo que llega es un blob. Sin esto, todas
 * las capturas se llamarían igual y en una fila de miniaturas no habría forma
 * de saber cuál es cuál. Con la fecha y la hora, el nombre dice al menos
 * cuándo se pegó.
 *
 * La extensión sale del TIPO y no de un nombre que no existe: según de dónde
 * se copie, el portapapeles entrega png, jpeg o webp.
 */
function nameScreenshot(content: Blob, type: string): File {
  const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  return new File([content], `captura-${stamp}.${extension}`, { type });
}

/**
 * Pegar una captura.
 *
 * Una captura de pantalla vive en el portapapeles y en ningún otro sitio: para
 * adjuntarla había que guardarla primero en el disco, buscarla y arrastrarla.
 * Tres pasos para algo que se acaba de capturar.
 *
 * Lo dispara un BOTÓN y no un atajo de teclado escuchando en la ficha. Un
 * pegado que solo funciona con el cursor en el sitio correcto no se descubre y
 * falla sin decir por qué; un botón se ve, dice lo que hace y se puede pulsar
 * con el dedo en un teléfono.
 *
 * El portapapeles no siempre se deja leer —Safari lo pregunta, y sin HTTPS ni
 * existe—, así que el fallo se cuenta y se ofrece la salida de siempre:
 * arrastrar o elegir del equipo.
 */
export function usePasteScreenshot(onFiles: (files: File[]) => void) {
  const [pasteProblem, setPasteProblem] = useState<string | null>(null);

  async function paste(): Promise<void> {
    setPasteProblem(null);

    try {
      const inClipboard = await navigator.clipboard.read();
      const screenshots: File[] = [];

      for (const element of inClipboard) {
        const type = element.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        screenshots.push(nameScreenshot(await element.getType(type), type));
      }

      if (screenshots.length === 0) {
        setPasteProblem(t('transactions.supports.clipboardEmpty'));
        return;
      }

      onFiles(screenshots);
    } catch {
      setPasteProblem(t('transactions.supports.clipboardDenied'));
    }
  }

  return { paste, pasteProblem };
}
