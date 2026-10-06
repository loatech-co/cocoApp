/**
 * Una foto de teléfono, lista para subir.
 *
 * ── Por qué se encoge ANTES de mandarla ─────────────────────────────────────
 * El servidor ya deja cada soporte en gris y a 1100px de ancho, así que la
 * foto de doce megapíxeles que sale de un teléfono se descarta casi entera
 * nada más llegar. Lo que hace es pagar el viaje: cuatro megas por datos
 * móviles, y luego una decodificación de doce megapíxeles en un plan
 * compartido.
 *
 * ── Y por qué eso arregla un fallo, no solo una lentitud ────────────────────
 * Porque el formato en el que un iPhone guarda sus fotos es HEIC, y la
 * librería de imágenes del servidor solo lo entiende si se compiló con soporte
 * para él —que es lo que casi nunca ocurre, porque va aparte por licencia—. Al
 * llegarle un HEIC, revienta, y lo que ve quien lo subió es «Ocurrió un error
 * inesperado».
 *
 * El navegador del teléfono SÍ sabe abrir sus propias fotos: es su formato
 * nativo. Así que se decodifica donde se puede —aquí— y lo que viaja es un JPG
 * que cualquiera entiende.
 *
 * ── Por qué nunca deja de subir ─────────────────────────────────────────────
 * Si algo falla —un formato que este navegador no abre, un lienzo que el
 * sistema no deja leer— se manda el archivo ORIGINAL. Encoger es una mejora,
 * no un requisito: convertirlo en un paso que puede impedir la subida sería
 * cambiar un fallo por otro.
 */

/**
 * Lo ancho que se manda. Por encima del 1100 al que el servidor reduce, para
 * que sea ÉL quien decida el recorte final y no se pierda nada por el camino
 * —y por si mañana ese número sube—.
 */
const MAX_SIDE_PX = 1600;

/** Calidad del JPG que viaja. Alta: la compresión de verdad la hace el servidor. */
const QUALITY = 0.85;

/**
 * Por debajo de esto, y si además CABE, no se toca.
 *
 * Una imagen pequeña y estrecha ya está bien: recodificarla solo le quita
 * nitidez al texto, que es justo lo que se viene a leer de un recibo.
 *
 * Las dos condiciones, y no solo el peso. Una captura de pantalla pesa 300 KB
 * y mide 2560 de ancho: pasaba el filtro por liviana y llegaba entera al
 * servidor, donde lo caro no es el peso sino DECODIFICARLA. Con los hilos
 * contados de un plan compartido, ese decodificado es el que reventaba con
 * «Error creating thread», y por eso fallaba pegar una captura y no fallaba
 * subir una foto —que pesa más, y por pesar más sí se encogía aquí—.
 */
const MIN_BYTES = 900 * 1024;

/**
 * Lo que se espera a que el navegador abra la imagen antes de rendirse.
 *
 * Generoso: es un archivo que ya está en memoria, así que abrirlo es
 * instantáneo salvo que algo vaya mal. Está para que «algo va mal» acabe en un
 * archivo subido sin encoger y no en una pantalla colgada.
 */
const MAX_WAIT_MS = 5000;

/** Un PDF no se toca: tiene páginas, y aplanarlo perdería todas menos una. */
function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

/** El mismo nombre pero con extensión `.jpg`: lo que viaja ya es un JPG. */
function asJpgName(name: string): string {
  return `${name.replace(/\.[a-z0-9]+$/i, '')}.jpg`;
}

/**
 * Decodifica la imagen con lo que haya.
 *
 * `createImageBitmap` es el camino bueno —no toca el DOM y respeta la
 * orientación EXIF si se le pide— pero no está en todas partes; el `<img>` con
 * un `blob:` funciona en cualquier navegador que abra ese formato.
 */
async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Y se sigue por el otro camino: hay navegadores que no admiten
      // `imageOrientation`, y otros que no saben con este formato.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      /*
        ── Con reloj, y no solo con `onload`/`onerror` ──────────────────────
        Una promesa que espera dos eventos se queda esperando para siempre si
        no llega ninguno, y entonces la subida entera se cuelga: sin error, sin
        aviso, con el botón girando.

        Pasa de verdad —un `blob:` que el navegador decide no cargar, un
        formato que ni abre ni rechaza— y pasaba poco porque solo llegaban aquí
        los archivos de más de 900 KB. Desde que se abre TODA imagen para saber
        cuánto mide, este camino lo pisa cualquier soporte.

        Rendirse es gratis: se manda el original, que es lo que se hace con
        cualquier otro fallo de aquí.
      */
      const timer = setTimeout(() => resolve(null), MAX_WAIT_MS);
      const finish = (result: HTMLImageElement | null): void => {
        clearTimeout(timer);
        resolve(result);
      };

      el.onload = () => finish(el);
      el.onerror = () => finish(null);
      el.src = url;
    });

    if (!image) return null;
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * La imagen encogida a JPG, o el archivo original si no se pudo.
 *
 * Nunca lanza: ver «por qué nunca deja de subir», arriba.
 */
export async function shrinkReceipt(file: File): Promise<File> {
  if (!isImage(file)) return file;
  // Un HEIC se convierte SIEMPRE, mida lo que mida: su problema no es el peso
  // sino el formato, que el servidor no sabe abrir.
  const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

  try {
    /*
      Se abre SIEMPRE, incluso una imagen liviana.

      Es el único modo de saber cuánto MIDE, que es lo que decide el trabajo
      del servidor, y aquí abrirla es barato: la decodifica el navegador, una
      sola vez, con la imagen que el usuario acaba de elegir delante.
    */
    const decoded = await decode(file);
    if (!decoded || decoded.width === 0 || decoded.height === 0) return file;

    const longestSide = Math.max(decoded.width, decoded.height);
    if (!isHeic && longestSide <= MAX_SIDE_PX && file.size < MIN_BYTES) return file;

    const scale = Math.min(1, MAX_SIDE_PX / longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(decoded.width * scale);
    canvas.height = Math.round(decoded.height * scale);

    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob) return file;

    /*
      Si no se ganó nada, se manda el original — pero «nada» son las DOS cosas.

      Antes bastaba con que el JPG pesara más para descartarlo, y eso devolvía
      al servidor la imagen grande de 2560px aunque la convertida midiera 1600:
      justo la que no queremos que le llegue. Solo se descarta cuando además no
      se encogió de tamaño, que es cuando de verdad no aporta.

      Con un HEIC se manda lo convertido igual, pese lo que pese: lo que
      importa de ese es el formato.
    */
    if (!isHeic && scale === 1 && blob.size >= file.size) return file;

    return new File([blob], asJpgName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

/** Lo mismo para una tanda. */
export async function shrinkReceipts(files: readonly File[]): Promise<File[]> {
  return Promise.all(files.map((file) => shrinkReceipt(file)));
}
