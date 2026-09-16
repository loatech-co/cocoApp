import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

/**
 * El tratamiento de un soporte antes de guardarlo.
 *
 * ── Por qué se toca el archivo ──────────────────────────────────────────────
 * Un recibo es una hoja escaneada o una foto del móvil: llega a color, a
 * cuatro mil píxeles de ancho y pesando tres megas, y no hace falta nada de
 * eso. Lo que se consulta de un recibo es el valor, la fecha y el membrete, y
 * eso se lee igual en gris y a 120 ppp. La diferencia es de cien a uno en
 * disco y en lo que tarda en abrirse.
 *
 * ── Por qué gris y no solo comprimir ────────────────────────────────────────
 * Porque casi todos los recibos SON grises —tinta negra sobre papel— y el
 * color que traen es el ruido del escáner: un fondo levemente azul, un sello
 * que no aporta. Quitarlo pesa menos y además deja el lote entero con el
 * mismo aspecto, que es lo que hace que una lista de ocho miniaturas se lea
 * como un conjunto y no como ocho fotos sueltas.
 *
 * ── Estos parámetros y no otros ─────────────────────────────────────────────
 * Son los del lote que ya está cargado. No se eligieron aquí: se copian para
 * que un soporte subido desde la aplicación quede indistinguible de los 443
 * que entraron por el importador. Si algún día se cambian, se cambian para
 * los dos sitios a la vez, que es justo por lo que este módulo existe.
 */

/** Ancho máximo de una imagen. Un recibo más ancho no se lee mejor. */
const ANCHO_MAXIMO = 1100;
/** Calidad JPEG. Por debajo de 50 el valor empieza a costar de leer. */
const CALIDAD = 55;
/** Resolución de las imágenes dentro de un PDF. */
const PPP = 120;

/** Lo que se acepta subir, por tipo declarado. */
export const TIPOS_DE_ENTRADA = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

/** Tope de entrada. Lo que salga de aquí pesará una fracción. */
export const TAMANO_MAXIMO = 25 * 1024 * 1024;

export interface SoporteOptimizado {
  contenido: Buffer;
  mime: string;
  /** Sin punto: `pdf` o `jpg`. */
  extension: 'pdf' | 'jpg';
}

/**
 * El binario de ghostscript.
 *
 * Configurable porque no está en el mismo sitio en todas partes —en el
 * servidor es `/usr/bin/gs`, en un Mac con Homebrew cuelga de `/opt/homebrew`—
 * y porque si algún día no está, conviene poder apuntarlo a otro sin tocar
 * código.
 */
function binarioDeGhostscript(): string {
  return process.env.GHOSTSCRIPT_BIN?.trim() || 'gs';
}

/**
 * Deja un soporte listo para guardarse: en gris y liviano.
 *
 * Un PDF sigue siendo un PDF —tiene páginas, y aplanarlo a una imagen perdería
 * las que no son la primera— y cualquier imagen sale como JPG, venga como
 * venga: png, webp o la foto HEIC de un iPhone.
 */
export async function optimizar(contenido: Buffer, mime: string): Promise<SoporteOptimizado> {
  if (mime === 'application/pdf') {
    return { contenido: await optimizarPdf(contenido), mime: 'application/pdf', extension: 'pdf' };
  }

  return { contenido: await optimizarImagen(contenido), mime: 'image/jpeg', extension: 'jpg' };
}

/**
 * Imagen → JPG en gris, como mucho 1100px de ancho.
 *
 * `withoutEnlargement` para no inflar una captura pequeña hasta 1100: subirla
 * de tamaño no añade un solo detalle y sí peso.
 *
 * Y se descartan los METADATOS al no pedirlos: una foto de un recibo lleva el
 * modelo del teléfono y, si el GPS estaba encendido, las coordenadas de dónde
 * se tomó. Eso no es parte del recibo.
 */
async function optimizarImagen(contenido: Buffer): Promise<Buffer> {
  return (
    sharp(contenido, { failOn: 'none' })
      .rotate() // Respeta el EXIF antes de tirarlo: si no, la foto sale tumbada.
      .grayscale()
      /*
        `toColourspace('b-w')` además de `grayscale()`, y no es redundante.

        `grayscale()` deja la imagen gris pero el JPEG sale igual con sus tres
        canales —los tres con el mismo valor— y pesa un tercio más para no
        decir nada nuevo. Esto lo escribe con UN canal, que es lo que hace
        `-colorspace Gray` en ImageMagick, con el que se trató el lote.
      */
      .toColourspace('b-w')
      .resize({ width: ANCHO_MAXIMO, withoutEnlargement: true })
      .jpeg({ quality: CALIDAD, mozjpeg: true })
      .toBuffer()
  );
}

/**
 * PDF → PDF en gris, comprimido y remuestreado a 120 ppp.
 *
 * ── Por qué ghostscript y no una librería de Node ───────────────────────────
 * Porque lo que hay que hacer no es reescribir el PDF sino REPROCESAR lo que
 * lleva dentro: convertir cada imagen incrustada a gris y bajarle la
 * resolución. Las librerías de Node saben manipular la estructura de un PDF
 * —páginas, campos, firmas— pero no recodifican sus imágenes, que es donde
 * está todo el peso de un escaneo.
 *
 * ── Por qué por archivos y no por tuberías ──────────────────────────────────
 * Ghostscript lee de la entrada estándar con `-`, pero para escribir en la
 * salida estándar hay que pedirle `-sOutputFile=-`, y entonces mezcla el PDF
 * con sus propios avisos en el mismo flujo. Un archivo temporal cuesta dos
 * escrituras y no tiene forma de salir corrupto.
 */
async function optimizarPdf(contenido: Buffer): Promise<Buffer> {
  const carpeta = await mkdtemp(join(tmpdir(), 'coco-soporte-'));
  const entrada = join(carpeta, `${randomUUID()}.pdf`);
  const salida = join(carpeta, `${randomUUID()}.pdf`);

  try {
    await writeFile(entrada, contenido);

    await correr(binarioDeGhostscript(), [
      '-o',
      salida,
      '-sDEVICE=pdfwrite',
      '-sColorConversionStrategy=Gray',
      '-sProcessColorModel=DeviceGray',
      '-dCompatibilityLevel=1.4',
      '-dPDFSETTINGS=/ebook',
      '-dDownsampleColorImages=true',
      `-dColorImageResolution=${PPP}`,
      '-dDownsampleGrayImages=true',
      `-dGrayImageResolution=${PPP}`,
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',
      entrada,
    ]);

    const resultado = await readFile(salida);

    /*
      Si el tratamiento no adelgaza, se queda el original.

      Pasa con los PDF que ya vienen optimizados —los del lote, sin ir más
      lejos— donde reprocesar añade la estructura de ghostscript sin quitar
      nada. Quedarse con el resultado más grande sería pagar por el trabajo de
      empeorarlo.
    */
    return resultado.length > 0 && resultado.length < contenido.length ? resultado : contenido;
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

/** Ejecuta un proceso y falla con su salida de error, que es la que explica. */
function correr(binario: string, argumentos: string[]): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(binario, argumentos, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';

    proceso.stderr.on('data', (trozo: Buffer) => {
      error += trozo.toString();
    });

    proceso.on('error', (e) =>
      rechazar(
        new Error(
          `No se pudo ejecutar ${binario}: ${e.message}. ` +
            'Define GHOSTSCRIPT_BIN si está en otra ruta.',
        ),
      ),
    );

    proceso.on('close', (codigo) =>
      codigo === 0 ? resolver() : rechazar(new Error(`${binario} salió con ${codigo}: ${error}`)),
    );
  });
}

/**
 * El nombre con el que se guarda un soporte: `<Concepto> - <Fecha de pago>`.
 *
 * ── Por qué NO el nombre que traía el archivo ───────────────────────────────
 * Porque el nombre que trae es `IMG_4821.HEIC` o `scan0007.pdf`, que no dice
 * de qué pago es. El del movimiento sí, y además hace que lo subido desde la
 * aplicación quede igual que los 443 del lote, que se nombraron así.
 *
 * ── Por qué sin el "i de N" ─────────────────────────────────────────────────
 * Porque el total cambia en cuanto se añade uno. Horneado en el nombre, el
 * cuarto soporte de un movimiento que decía "1 de 3" obligaría a renombrar los
 * tres anteriores. El orden vive en su columna y el "i de N" se calcula al
 * mirarlo.
 */
export function nombreDeSoporte(concepto: string, fechaISO: string, extension: string): string {
  return `${saneado(concepto)} - ${fechaISO}.${extension}`;
}

/**
 * Un nombre que el sistema de archivos y una descarga aceptan.
 *
 * La barra es el caso real: "PILA / Seguridad Social" no cabe en un nombre de
 * archivo y en el lote se guardó como "PILA - Seguridad Social".
 */
function saneado(texto: string): string {
  return (
    texto
      .replace(/[/\\]/g, '-')
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"|?* -]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'Soporte'
  );
}
