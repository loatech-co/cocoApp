import {
  ghostscriptArgs,
  matchesDeclaredType,
  asReceived,
  run,
  isOutOfResources,
} from './receipts.optimization';

/**
 * Qué se le contesta a quien sube un soporte que no se pudo tratar.
 *
 * Son dos respuestas OPUESTAS y las decide esta función: «manda otra cosa»
 * cuando el formato no se puede abrir, y «vuelve a mandar lo mismo» cuando al
 * servidor se le acabaron los hilos. Equivocarse aquí es mandar a alguien a
 * convertir un archivo que ya estaba bien, o a reintentar para siempre uno que
 * nunca va a entrar.
 */
describe('Falta de recursos contra formato que no se entiende', () => {
  it('reconoce el hilo que no se pudo crear', () => {
    // El caso real, tal como sale de libvips en el hosting compartido: la
    // cuenta tiene un cupo de procesos, libvips pide su piscina de hilos y
    // `pthread_create` devuelve EAGAIN.
    expect(
      isOutOfResources(new Error('glib: Error creating thread: Resource temporarily unavailable')),
    ).toBe(true);
  });

  it('reconoce quedarse sin memoria y sin descriptores', () => {
    for (const message of [
      'Cannot allocate memory',
      'vips__init: out of memory',
      'spawn ENOMEM',
      'EMFILE: too many open files',
      'gs salió con 1: fork: Resource temporarily unavailable',
    ]) {
      expect(isOutOfResources(new Error(message))).toBe(true);
    }
  });

  it('NO confunde un formato que la librería no sabe abrir', () => {
    // El HEIC del iPhone: libvips solo lo entiende si se compiló con soporte
    // para él, y casi nunca lo está. Reintentarlo no cambia nada, así que esto
    // tiene que seguir contestando 415 y no 503.
    for (const message of [
      'Input buffer contains unsupported image format',
      'heifload: unsupported compression',
      'VipsForeignLoad: buffer is not in a known format',
    ]) {
      expect(isOutOfResources(new Error(message))).toBe(false);
    }
  });

  it('aguanta lo que no es un Error', () => {
    // Una librería nativa puede rechazar con una cadena suelta, y el camino
    // que lee `causa.message` se caería justo dentro del manejador de errores.
    expect(isOutOfResources('Resource temporarily unavailable')).toBe(true);
    expect(isOutOfResources(undefined)).toBe(false);
    expect(isOutOfResources(null)).toBe(false);
  });
});

/**
 * Lo que se guarda cuando tratar la imagen no se pudo por falta de recursos.
 *
 * Tratar es una mejora, no un requisito: el recibo se ve igual sin ella.
 * Perder el soporte porque al servidor le faltaban hilos ese segundo sería
 * cambiar una mejora por un fallo.
 */
describe('Guardar el archivo tal como llegó', () => {
  it('acepta lo que el visor sabe abrir, con su extensión de verdad', () => {
    const bytes = Buffer.from([1, 2, 3]);

    // La extensión dice la verdad: un PNG guardado como `.jpg` es un archivo
    // que miente sobre sí mismo.
    expect(asReceived(bytes, 'image/png')).toEqual({
      content: bytes,
      mime: 'image/png',
      extension: 'png',
    });
    expect(asReceived(bytes, 'image/jpeg')?.extension).toBe('jpg');
    expect(asReceived(bytes, 'application/pdf')?.extension).toBe('pdf');
  });

  it('se niega con lo que después no se podría mirar', () => {
    // Un HEIC sin tratar es un archivo que el visor no abre: ahí el problema
    // es el formato, y guardarlo igual solo aplaza el fallo.
    expect(asReceived(Buffer.alloc(0), 'image/heic')).toBeNull();
    expect(asReceived(Buffer.alloc(0), 'image/webp')).toBeNull();
  });
});

describe('Lo que se sube es lo que dice ser', () => {
  const PDF = Buffer.from('%PDF-1.7\n', 'latin1');
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const POSTSCRIPT = Buffer.from('%!PS-Adobe-3.0\n', 'latin1');

  it('acepta cada tipo con su firma', () => {
    expect(matchesDeclaredType(PDF, 'application/pdf')).toBe(true);
    expect(matchesDeclaredType(JPEG, 'image/jpeg')).toBe(true);
    expect(matchesDeclaredType(PNG, 'image/png')).toBe(true);
    expect(matchesDeclaredType(Buffer.from('....ftypheic', 'latin1'), 'image/heic')).toBe(true);
    expect(matchesDeclaredType(Buffer.from('RIFF....WEBPVP8 ', 'latin1'), 'image/webp')).toBe(true);
  });

  it('rechaza lo que no coincide con el tipo declarado', () => {
    // Un PostScript etiquetado como PDF llegaría directo al intérprete.
    expect(matchesDeclaredType(POSTSCRIPT, 'application/pdf')).toBe(false);
    expect(matchesDeclaredType(PNG, 'image/jpeg')).toBe(false);
    expect(matchesDeclaredType(JPEG, 'application/pdf')).toBe(false);
    expect(matchesDeclaredType(Buffer.alloc(0), 'image/png')).toBe(false);
    expect(matchesDeclaredType(PDF, 'text/plain')).toBe(false);
  });
});

describe('Ghostscript con protecciones', () => {
  it('corre en modo seguro', () => {
    expect(ghostscriptArgs('/tmp/a.pdf', '/tmp/b.pdf')[0]).toBe('-dSAFER');
  });

  it('mata el proceso que pasa del tiempo límite', async () => {
    const start = Date.now();
    await expect(run('sleep', ['5'], 100)).rejects.toThrow(/tardó más de/);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
