import { comoLlego, esFaltaDeRecursos } from './soportes.optimizacion';

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
      esFaltaDeRecursos(new Error('glib: Error creating thread: Resource temporarily unavailable')),
    ).toBe(true);
  });

  it('reconoce quedarse sin memoria y sin descriptores', () => {
    for (const mensaje of [
      'Cannot allocate memory',
      'vips__init: out of memory',
      'spawn ENOMEM',
      'EMFILE: too many open files',
      'gs salió con 1: fork: Resource temporarily unavailable',
    ]) {
      expect(esFaltaDeRecursos(new Error(mensaje))).toBe(true);
    }
  });

  it('NO confunde un formato que la librería no sabe abrir', () => {
    // El HEIC del iPhone: libvips solo lo entiende si se compiló con soporte
    // para él, y casi nunca lo está. Reintentarlo no cambia nada, así que esto
    // tiene que seguir contestando 415 y no 503.
    for (const mensaje of [
      'Input buffer contains unsupported image format',
      'heifload: unsupported compression',
      'VipsForeignLoad: buffer is not in a known format',
    ]) {
      expect(esFaltaDeRecursos(new Error(mensaje))).toBe(false);
    }
  });

  it('aguanta lo que no es un Error', () => {
    // Una librería nativa puede rechazar con una cadena suelta, y el camino
    // que lee `causa.message` se caería justo dentro del manejador de errores.
    expect(esFaltaDeRecursos('Resource temporarily unavailable')).toBe(true);
    expect(esFaltaDeRecursos(undefined)).toBe(false);
    expect(esFaltaDeRecursos(null)).toBe(false);
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
    expect(comoLlego(bytes, 'image/png')).toEqual({
      contenido: bytes,
      mime: 'image/png',
      extension: 'png',
    });
    expect(comoLlego(bytes, 'image/jpeg')?.extension).toBe('jpg');
    expect(comoLlego(bytes, 'application/pdf')?.extension).toBe('pdf');
  });

  it('se niega con lo que después no se podría mirar', () => {
    // Un HEIC sin tratar es un archivo que el visor no abre: ahí el problema
    // es el formato, y guardarlo igual solo aplaza el fallo.
    expect(comoLlego(Buffer.alloc(0), 'image/heic')).toBeNull();
    expect(comoLlego(Buffer.alloc(0), 'image/webp')).toBeNull();
  });
});
