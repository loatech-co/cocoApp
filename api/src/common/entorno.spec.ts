import { leerDelEntorno, sinComillas } from './entorno';

/**
 * Una variable de entorno con comillas dentro del valor.
 *
 * No es hipotético: es el fallo que dejó los 445 soportes marcados como «no
 * está en el servidor» durante una tarde. LiteSpeed inyecta el `.env` tal cual
 * está escrito, así que `SOPORTES_DIR="/home/…"` llega CON las comillas, la
 * ruta deja de empezar por `/` y `resolve` la cuelga del directorio de
 * trabajo. La carpeta resultante no existe y todo sale no disponible.
 */
describe('Leer del entorno', () => {
  const antes = { ...process.env };
  afterEach(() => {
    process.env = { ...antes };
  });

  it('quita las comillas dobles que envuelven el valor', () => {
    process.env.PRUEBA = '"/home/u523998927/soportes-cocoapp"';
    expect(leerDelEntorno('PRUEBA')).toBe('/home/u523998927/soportes-cocoapp');
  });

  it('y las simples', () => {
    process.env.PRUEBA = "'/usr/bin/gs'";
    expect(leerDelEntorno('PRUEBA')).toBe('/usr/bin/gs');
  });

  it('deja en paz un valor normal', () => {
    process.env.PRUEBA = '/home/u523998927/soportes-cocoapp';
    expect(leerDelEntorno('PRUEBA')).toBe('/home/u523998927/soportes-cocoapp');
  });

  it('no toca las comillas que NO envuelven', () => {
    // Solo se quitan las emparejadas de los extremos: una ruta que de verdad
    // lleve una comilla en medio se queda como está.
    expect(sinComillas('/ruta/con"comilla/dentro')).toBe('/ruta/con"comilla/dentro');
    expect(sinComillas('"sin cerrar')).toBe('"sin cerrar');
    expect(sinComillas("\"mezcladas'")).toBe("\"mezcladas'");
  });

  it('un valor vacío es como no tenerlo', () => {
    // Para que quien lee pueda usar `??` y caer en su valor de fábrica: unas
    // comillas vacías en el `.env` no deberían apuntar a la raíz.
    process.env.PRUEBA = '""';
    expect(leerDelEntorno('PRUEBA')).toBeUndefined();

    process.env.PRUEBA = '   ';
    expect(leerDelEntorno('PRUEBA')).toBeUndefined();

    delete process.env.PRUEBA;
    expect(leerDelEntorno('PRUEBA')).toBeUndefined();
  });

  it('recorta el espacio de los dos lados de las comillas', () => {
    process.env.PRUEBA = '  " /usr/bin/gs "  ';
    expect(leerDelEntorno('PRUEBA')).toBe('/usr/bin/gs');
  });
});
