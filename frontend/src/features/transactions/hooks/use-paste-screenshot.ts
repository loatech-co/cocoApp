import { useState } from 'react';

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
function nombrarCaptura(contenido: Blob, tipo: string): File {
  const extension = tipo.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  return new File([contenido], `captura-${sello}.${extension}`, { type: tipo });
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
export function usePasteScreenshot(onArchivos: (archivos: File[]) => void) {
  const [problemaAlPegar, setProblemaAlPegar] = useState<string | null>(null);

  async function pegar(): Promise<void> {
    setProblemaAlPegar(null);

    try {
      const enElPortapapeles = await navigator.clipboard.read();
      const capturas: File[] = [];

      for (const elemento of enElPortapapeles) {
        const tipo = elemento.types.find((t) => t.startsWith('image/'));
        if (!tipo) continue;
        capturas.push(nombrarCaptura(await elemento.getType(tipo), tipo));
      }

      if (capturas.length === 0) {
        setProblemaAlPegar('En el portapapeles no hay ninguna imagen.');
        return;
      }

      onArchivos(capturas);
    } catch {
      setProblemaAlPegar(
        'El navegador no dejó leer el portapapeles. Arrastra la captura o elígela del equipo.',
      );
    }
  }

  return { pegar, problemaAlPegar };
}
