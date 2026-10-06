import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { readEnv } from '../../common/env';

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

/*
  ── libvips trabaja con UN hilo, y no es una optimización ────────────────────
  Es lo que hace que funcione en el servidor donde esto vive.

  `sharp` es un envoltorio de libvips, que de fábrica abre una piscina de hilos
  del tamaño del número de núcleos que ve. En un hosting COMPARTIDO eso es una
  trampa: la máquina declara dieciséis núcleos porque los tiene, pero la cuenta
  tiene un cupo de procesos e hilos muy por debajo de eso y compartido con todo
  lo demás que esté corriendo. libvips pide su piscina, `pthread_create`
  devuelve EAGAIN y el error que sale por abajo es

      glib: Error creating thread: Resource temporarily unavailable

  que además es INTERMITENTE —depende de cuánto esté gastando el vecino en ese
  segundo—, así que la misma captura falla una vez y entra a la siguiente. Es
  el mismo cupo que ya nos había mordido en los despliegues.

  Con la concurrencia en 1, libvips hace el trabajo en el hilo que ya tiene y
  no pide ninguno. Se pierde velocidad en una imagen grande y no se pierde
  nada más: aquí se trata UN recibo de 1100px de ancho, no un lote.

  Se deja configurable porque en una máquina propia —un contenedor con sus
  núcleos— subirlo sí compensa. El valor de fábrica es el que aguanta en el
  sitio donde de verdad está desplegado.

  `cache(false)` va por lo mismo: la caché de libvips reserva memoria y abre
  descriptores para reutilizar operaciones entre llamadas, y aquí no hay nada
  que reutilizar —cada soporte se trata una vez y no vuelve—.
*/
sharp.concurrency(Number(process.env.SHARP_CONCURRENCY) || 1);
sharp.cache(false);

/** Ancho máximo de una imagen. Un recibo más ancho no se lee mejor. */
const MAX_WIDTH = 1100;
/** Calidad JPEG. Por debajo de 50 el valor empieza a costar de leer. */
const JPEG_QUALITY = 55;
/** Resolución de las imágenes dentro de un PDF. */
const PPP = 120;

/** Lo que se acepta subir, por tipo declarado. */
export const INPUT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

/**
 * La firma con la que empieza cada tipo de entrada.
 *
 * El `mimetype` lo escribe el cliente: se puede mandar cualquier cosa
 * etiquetada como `application/pdf` y llegaría tal cual a ghostscript, que es
 * un intérprete de PostScript. Lo que se procesa es lo que los PRIMEROS bytes
 * dicen que es, y tiene que coincidir con lo que se declaró.
 *
 * HEIC/HEIF son contenedores ISO BMFF (`ftyp` en el byte 4); WEBP es RIFF con
 * `WEBP` en el byte 8.
 */
const MAGIC_BYTES: Record<string, readonly { offset: number; bytes: Buffer }[]> = {
  'application/pdf': [{ offset: 0, bytes: Buffer.from('%PDF-', 'latin1') }],
  'image/jpeg': [{ offset: 0, bytes: Buffer.from([0xff, 0xd8, 0xff]) }],
  'image/png': [
    { offset: 0, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  ],
  'image/heic': [{ offset: 4, bytes: Buffer.from('ftyp', 'latin1') }],
  'image/heif': [{ offset: 4, bytes: Buffer.from('ftyp', 'latin1') }],
  'image/webp': [
    { offset: 0, bytes: Buffer.from('RIFF', 'latin1') },
    { offset: 8, bytes: Buffer.from('WEBP', 'latin1') },
  ],
};

/** ¿Los bytes del archivo son de verdad del tipo que se declaró? */
export function matchesDeclaredType(content: Buffer, mime: string): boolean {
  const signatures = MAGIC_BYTES[mime];
  if (!signatures) return false;
  return signatures.every(({ offset, bytes }) =>
    content.subarray(offset, offset + bytes.length).equals(bytes),
  );
}

/**
 * Lo más que puede tardar ghostscript con un PDF. Uno legítimo de recibos
 * tarda segundos; uno hecho para colgarlo se queda con un proceso de una
 * cuota que en el hosting es mínima. Pasado el tope, se mata.
 */
const GHOSTSCRIPT_TIMEOUT_MS = 20_000;

/** Tope de entrada. Lo que salga de aquí pesará una fracción. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface OptimizedReceipt {
  content: Buffer;
  mime: string;
  /** Sin punto: `pdf` o `jpg`. */
  extension: 'pdf' | 'jpg' | 'png';
}

/**
 * El binario de ghostscript.
 *
 * Configurable porque no está en el mismo sitio en todas partes —en el
 * servidor es `/usr/bin/gs`, en un Mac con Homebrew cuelga de `/opt/homebrew`—
 * y porque si algún día no está, conviene poder apuntarlo a otro sin tocar
 * código.
 */
function ghostscriptBinary(): string {
  // Con comillas dentro del valor —que es como llega en el servidor— `spawn`
  // busca un ejecutable llamado `"/usr/bin/gs"` y ningún PDF se optimiza.
  return readEnv('GHOSTSCRIPT_BIN') ?? 'gs';
}

/**
 * Deja un soporte listo para guardarse: en gris y liviano.
 *
 * Un PDF sigue siendo un PDF —tiene páginas, y aplanarlo a una imagen perdería
 * las que no son la primera— y cualquier imagen sale como JPG, venga como
 * venga: png, webp o la foto HEIC de un iPhone.
 */
export async function optimize(content: Buffer, mime: string): Promise<OptimizedReceipt> {
  if (mime === 'application/pdf') {
    return { content: await optimizePdf(content), mime: 'application/pdf', extension: 'pdf' };
  }

  return { content: await optimizeImage(content), mime: 'image/jpeg', extension: 'jpg' };
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
async function optimizeImage(content: Buffer): Promise<Buffer> {
  return (
    sharp(content, { failOn: 'none' })
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
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
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
async function optimizePdf(content: Buffer): Promise<Buffer> {
  const folder = await mkdtemp(join(tmpdir(), 'coco-soporte-'));
  const input = join(folder, `${randomUUID()}.pdf`);
  const output = join(folder, `${randomUUID()}.pdf`);

  try {
    await writeFile(input, content);

    await run(ghostscriptBinary(), ghostscriptArgs(input, output));

    const result = await readFile(output);

    /*
      Si el tratamiento no adelgaza, se queda el original.

      Pasa con los PDF que ya vienen optimizados —los del lote, sin ir más
      lejos— donde reprocesar añade la estructura de ghostscript sin quitar
      nada. Quedarse con el resultado más grande sería pagar por el trabajo de
      empeorarlo.
    */
    return result.length > 0 && result.length < content.length ? result : content;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/**
 * Los argumentos de ghostscript. `-dSAFER` va primero y es la protección: sin
 * él, un PDF puede pedirle al intérprete que lea o escriba archivos del
 * servidor y que ejecute órdenes. Las versiones recientes lo traen por
 * defecto; se escribe igual para no depender de la que haya instalada.
 */
export function ghostscriptArgs(input: string, output: string): string[] {
  return [
    '-dSAFER',
    '-o',
    output,
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
    input,
  ];
}

/** Ejecuta un proceso y falla con su salida de error, que es la que explica. */
export function run(
  binary: string,
  args: string[],
  timeoutMs = GHOSTSCRIPT_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    let isTimedOut = false;

    // SIGKILL y no SIGTERM: un intérprete atascado puede ignorar la petición
    // de terminar, y lo que se quiere es recuperar el proceso.
    const timer = setTimeout(() => {
      isTimedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stderr.on('data', (chunk: Buffer) => {
      error += chunk.toString();
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(
        new Error(
          `No se pudo ejecutar ${binary}: ${e.message}. ` +
            'Define GHOSTSCRIPT_BIN si está en otra ruta.',
        ),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (isTimedOut) {
        reject(new Error(`${binary} tardó más de ${Math.round(timeoutMs / 1000)} s y se detuvo.`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${binary} salió con ${code}: ${error}`));
      }
    });
  });
}

/**
 * Lo que llegó, sin tratar, si es algo que la aplicación sabe enseñar.
 *
 * ── Para cuándo es ─────────────────────────────────────────────────────────
 * Para cuando tratar la imagen falla por falta de recursos. Tratarla es una
 * MEJORA —gris, 1100px, un tercio del peso—, no un requisito: el recibo se ve
 * igual sin ella. Perder el soporte porque al servidor le faltaban hilos en
 * ese segundo es cambiar una mejora por un fallo, que es exactamente lo que
 * hacía: «no se pudo procesar», y el archivo a la basura.
 *
 * Es el mismo trato que ya se da en el navegador, donde encoger antes de subir
 * también cede el paso al original si no se puede.
 *
 * ── Por qué solo estos tres ────────────────────────────────────────────────
 * Porque son los que el visor de la aplicación sabe abrir. Guardar un HEIC sin
 * tratar sería guardar un archivo que después no se puede mirar: ahí el
 * problema es el formato y ceder no arregla nada.
 */
export function asReceived(content: Buffer, mime: string): OptimizedReceipt | null {
  // La extensión dice la VERDAD de lo que se guarda. Un PNG con nombre `.jpg`
  // es un archivo que miente sobre sí mismo, y el día que alguien lea el
  // almacén por fuera de la aplicación —un respaldo, un script— se encuentra
  // con que la mitad de los `.jpg` no lo son.
  if (mime === 'application/pdf') return { content, mime, extension: 'pdf' };
  if (mime === 'image/jpeg') return { content, mime, extension: 'jpg' };
  if (mime === 'image/png') return { content, mime, extension: 'png' };
  return null;
}

/**
 * ¿Esto falló por falta de RECURSOS del servidor, y no por el archivo?
 *
 * ── Por qué hay que distinguirlo ────────────────────────────────────────────
 * Porque las dos cosas se contestan al revés. Un formato que la librería no
 * sabe abrir —el HEIC de un iPhone— es definitivo: por más que se reintente,
 * ese archivo no va a entrar, y lo que hay que decir es «manda un JPG». Un
 * hilo que no se pudo crear es pasajero: el archivo está perfecto y lo único
 * que hay que hacer es esperar un momento.
 *
 * Estaban mezclados, y el resultado era el peor de los dos: una captura PNG
 * recibía «este servidor no sabe abrir ese formato, vuelve a intentarlo con un
 * JPG o un PNG» —es decir, un consejo imposible de seguir, porque ya era un
 * PNG— y el problema real quedaba escondido en el paréntesis del final.
 *
 * ── Qué se mira ─────────────────────────────────────────────────────────────
 * El texto, porque es lo único que hay: libvips y ghostscript no devuelven un
 * código, devuelven la cadena que les dio el sistema operativo. Son los
 * errores de agotamiento de toda la vida —no poder crear un hilo, no poder
 * reservar memoria, no quedar descriptores— y sus nombres no los inventa
 * ninguna librería: los pone `errno`.
 */
export function isOutOfResources(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);

  return /resource temporarily unavailable|error creating thread|cannot allocate memory|out of memory|enomem|eagain|too many open files|emfile|enfile|cannot fork|resource deadlock/i.test(
    message,
  );
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
export function receiptFileName(concept: string, isoDate: string, extension: string): string {
  return `${sanitized(concept)} - ${isoDate}.${extension}`;
}

/**
 * Un nombre que el sistema de archivos y una descarga aceptan.
 *
 * La barra es el caso real: "PILA / Seguridad Social" no cabe en un nombre de
 * archivo y en el lote se guardó como "PILA - Seguridad Social".
 */
function sanitized(text: string): string {
  return (
    text
      .replace(/[/\\]/g, '-')
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"|?* -]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'Soporte'
  );
}
