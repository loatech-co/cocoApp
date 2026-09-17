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
const ANCHO_MAXIMO = 1600;

/** Calidad del JPG que viaja. Alta: la compresión de verdad la hace el servidor. */
const CALIDAD = 0.85;

/**
 * Por debajo de esto no se toca.
 *
 * Una captura de pantalla de 200 KB ya está bien: recodificarla solo le quita
 * nitidez al texto, que es justo lo que se viene a leer de un recibo.
 */
const DESDE = 900 * 1024;

/** Un PDF no se toca: tiene páginas, y aplanarlo perdería todas menos una. */
function esImagen(archivo: File): boolean {
  return archivo.type.startsWith('image/');
}

/** El mismo nombre pero con extensión `.jpg`: lo que viaja ya es un JPG. */
function comoJpg(nombre: string): string {
  return `${nombre.replace(/\.[a-z0-9]+$/i, '')}.jpg`;
}

/**
 * Decodifica la imagen con lo que haya.
 *
 * `createImageBitmap` es el camino bueno —no toca el DOM y respeta la
 * orientación EXIF si se le pide— pero no está en todas partes; el `<img>` con
 * un `blob:` funciona en cualquier navegador que abra ese formato.
 */
async function decodificar(
  archivo: File,
): Promise<{ fuente: CanvasImageSource; ancho: number; alto: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const mapa = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      return { fuente: mapa, ancho: mapa.width, alto: mapa.height };
    } catch {
      // Y se sigue por el otro camino: hay navegadores que no admiten
      // `imageOrientation`, y otros que no saben con este formato.
    }
  }

  const url = URL.createObjectURL(archivo);
  try {
    const imagen = await new Promise<HTMLImageElement | null>((resolver) => {
      const el = new Image();
      el.onload = () => resolver(el);
      el.onerror = () => resolver(null);
      el.src = url;
    });

    if (!imagen) return null;
    return { fuente: imagen, ancho: imagen.naturalWidth, alto: imagen.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * La imagen encogida a JPG, o el archivo original si no se pudo.
 *
 * Nunca lanza: ver «por qué nunca deja de subir», arriba.
 */
export async function encogerSoporte(archivo: File): Promise<File> {
  if (!esImagen(archivo)) return archivo;
  // Un JPG o un PNG pequeños ya están bien; un HEIC se convierte SIEMPRE, mida
  // lo que mida, porque el problema de ese no es el peso sino el formato.
  const esHeic = /hei[cf]/i.test(archivo.type) || /\.hei[cf]$/i.test(archivo.name);
  if (!esHeic && archivo.size < DESDE) return archivo;

  try {
    const abierta = await decodificar(archivo);
    if (!abierta || abierta.ancho === 0 || abierta.alto === 0) return archivo;

    const escala = Math.min(1, ANCHO_MAXIMO / Math.max(abierta.ancho, abierta.alto));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(abierta.ancho * escala);
    lienzo.height = Math.round(abierta.alto * escala);

    const pincel = lienzo.getContext('2d');
    if (!pincel) return archivo;
    pincel.drawImage(abierta.fuente, 0, 0, lienzo.width, lienzo.height);

    const trozo = await new Promise<Blob | null>((resolver) =>
      lienzo.toBlob(resolver, 'image/jpeg', CALIDAD),
    );
    if (!trozo) return archivo;

    // Si la conversión no gana nada —y con un HEIC pequeño puede pasar—, se
    // manda lo convertido igual: lo que importa de un HEIC es el formato.
    if (!esHeic && trozo.size >= archivo.size) return archivo;

    return new File([trozo], comoJpg(archivo.name), {
      type: 'image/jpeg',
      lastModified: archivo.lastModified,
    });
  } catch {
    return archivo;
  }
}

/** Lo mismo para una tanda. */
export async function encogerSoportes(archivos: readonly File[]): Promise<File[]> {
  return Promise.all(archivos.map((archivo) => encogerSoporte(archivo)));
}
