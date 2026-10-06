/**
 * A phone photo, ready to upload.
 *
 * ── Why it is shrunk BEFORE sending it ──────────────────────────────────────
 * The server already turns every receipt gray and 1100px wide, so the
 * twelve-megapixel photo that comes out of a phone is almost entirely
 * discarded on arrival. What it does do is pay for the trip: four megabytes
 * over mobile data, and then a twelve-megapixel decode on a shared plan.
 *
 * ── And why that fixes a failure, not just slowness ─────────────────────────
 * Because the format an iPhone stores its photos in is HEIC, and the server's
 * image library only understands it if it was compiled with support for it
 * —which almost never happens, because it ships separately for licensing
 * reasons—. When a HEIC reaches it, it blows up, and what the person who
 * uploaded it sees is «Ocurrió un error inesperado».
 *
 * The phone's browser DOES know how to open its own photos: it is its native
 * format. So it is decoded where it can be —here— and what travels is a JPG
 * anyone understands.
 *
 * ── Why it never stops the upload ───────────────────────────────────────────
 * If something fails —a format this browser cannot open, a canvas the system
 * will not let us read— the ORIGINAL file is sent. Shrinking is an
 * improvement, not a requirement: turning it into a step that can prevent the
 * upload would be trading one failure for another.
 */

/**
 * The width that is sent. Above the 1100 the server reduces to, so that IT
 * decides the final cut and nothing is lost on the way —and in case that
 * number goes up tomorrow—.
 */
const MAX_SIDE_PX = 1600;

/** Quality of the JPG that travels. High: the real compression is the server's. */
const QUALITY = 0.85;

/**
 * Below this, and if it also FITS, it is left alone.
 *
 * A small, narrow image is already fine: re-encoding it only takes sharpness
 * away from the text, which is exactly what a receipt is read for.
 *
 * Both conditions, and not just the weight. A screenshot weighs 300 KB and is
 * 2560 wide: it passed the filter for being light and reached the server
 * whole, where the expensive part is not the weight but DECODING it. With the
 * counted threads of a shared plan, that decode is the one that blew up with
 * «Error creating thread», and that is why pasting a screenshot failed and
 * uploading a photo did not —it weighs more, and for weighing more it did get
 * shrunk here—.
 */
const MIN_BYTES = 900 * 1024;

/**
 * How long to wait for the browser to open the image before giving up.
 *
 * Generous: it is a file already in memory, so opening it is instantaneous
 * unless something goes wrong. It is there so that «something goes wrong»
 * ends in a file uploaded unshrunk and not in a frozen screen.
 */
const MAX_WAIT_MS = 5000;

/** A PDF is not touched: it has pages, and flattening it would lose all but one. */
function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

/** The same name but with a `.jpg` extension: what travels is already a JPG. */
function asJpgName(name: string): string {
  return `${name.replace(/\.[a-z0-9]+$/i, '')}.jpg`;
}

/**
 * Decodes the image with whatever is available.
 *
 * `createImageBitmap` is the good path —it does not touch the DOM and honors
 * the EXIF orientation if asked— but it is not everywhere; an `<img>` with a
 * `blob:` works in any browser that opens that format.
 */
async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // And it goes on by the other path: some browsers do not accept
      // `imageOrientation`, and others cannot handle this format.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      /*
        ── With a timer, and not only with `onload`/`onerror` ───────────────
        A promise that waits for two events waits forever if neither arrives,
        and then the whole upload hangs: no error, no notice, the button
        spinning.

        It really happens —a `blob:` the browser decides not to load, a format
        it neither opens nor rejects— and it happened rarely because only files
        over 900 KB reached this point. Since EVERY image is opened to learn its
        size, any receipt goes down this path.

        Giving up is free: the original is sent, which is what any other
        failure here does.
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
 * The image shrunk to JPG, or the original file if that was not possible.
 *
 * Never throws: see «why it never stops the upload», above.
 */
export async function shrinkReceipt(file: File): Promise<File> {
  if (!isImage(file)) return file;
  // A HEIC is ALWAYS converted, whatever its size: its problem is not the
  // weight but the format, which the server cannot open.
  const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

  try {
    /*
      It is ALWAYS opened, even a light image.

      It is the only way to know how big it IS, which is what decides the
      server's work, and opening it here is cheap: the browser decodes it,
      once, with the image the user just picked right there.
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
      If nothing was gained, the original is sent — but «nothing» means BOTH
      things.

      It used to be enough for the JPG to weigh more to discard it, and that
      sent the server back the big 2560px image even when the converted one
      measured 1600: exactly the one we do not want reaching it. It is only
      discarded when it also did not shrink in size, which is when it really
      adds nothing.

      With a HEIC the converted one is sent anyway, whatever it weighs: what
      matters about that one is the format.
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

/** The same for a batch. */
export async function shrinkReceipts(files: readonly File[]): Promise<File[]> {
  return Promise.all(files.map((file) => shrinkReceipt(file)));
}
