import { PERMISO_DE_BASE_REMOTA, leerDelEntorno, porQueNoArrancar, sinComillas } from './entorno';

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

/**
 * Que una sesión de desarrollo no pueda escribir en una base remota.
 *
 * `api/.env` apuntaba al Postgres de producción, así que cualquier `npm run
 * dev` escribía en los datos de verdad sin que nada lo dijera. El error no era
 * de nadie: era el valor por defecto.
 */
describe('Negarse a arrancar contra una base que no es la mía', () => {
  const local = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@localhost:5432/coco_dev' };
  const remota = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
  };

  it('deja pasar la base local', () => {
    expect(porQueNoArrancar(local)).toBeNull();
    expect(porQueNoArrancar({ ...local, DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x' })).toBeNull();
  });

  it('frena cualquier host remoto, no solo Supabase', () => {
    // La pregunta no es «¿esto es producción?» sino «¿esto es mi máquina?».
    expect(porQueNoArrancar(remota)).toContain('no es tu máquina');
    expect(
      porQueNoArrancar({ ...local, DATABASE_URL: 'postgresql://u:p@db.ejemplo.com:5432/x' }),
    ).toContain('no es tu máquina');
  });

  it('en producción no se mete', () => {
    expect(porQueNoArrancar({ ...remota, NODE_ENV: 'production' })).toBeNull();
  });

  it('se puede salir fuera, pero diciéndolo en voz alta', () => {
    expect(porQueNoArrancar({ ...remota, [PERMISO_DE_BASE_REMOTA]: 'si' })).toBeNull();
    // Cualquier otra cosa no vale: el permiso es explícito o no es.
    expect(porQueNoArrancar({ ...remota, [PERMISO_DE_BASE_REMOTA]: 'true' })).not.toBeNull();
  });

  it('el mensaje dice qué hacer, no solo que no', () => {
    const dicho = porQueNoArrancar(remota) ?? '';
    expect(dicho).toContain('api/.env.migrate');
    expect(dicho).toContain(PERMISO_DE_BASE_REMOTA);
  });

  it('sin DATABASE_URL no es asunto suyo', () => {
    // Falta la variable: que se queje quien la necesita, con su propio error.
    expect(porQueNoArrancar({ NODE_ENV: 'development' })).toBeNull();
  });
});
