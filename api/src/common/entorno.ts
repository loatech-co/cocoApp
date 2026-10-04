/**
 * Leer una variable de entorno sin fiarse de cómo la escribió quien la puso.
 *
 * ── El fallo que esto arregla ───────────────────────────────────────────────
 * En el servidor, LiteSpeed inyecta el `.env` en el proceso TAL CUAL está
 * escrito, comillas incluidas. `SOPORTES_DIR="/home/u.../soportes-cocoapp"`
 * llega con las comillas dentro del valor, y entonces:
 *
 *   resolve('"/home/u.../soportes-cocoapp"')
 *
 * no empieza por `/`, así que `resolve` lo trata como RELATIVO y lo cuelga del
 * directorio de trabajo. El resultado es una carpeta que no existe, dentro de
 * la versión desplegada, con las comillas en el nombre. `existsSync` decía que
 * no para los 445 soportes, la lista los marcaba como no disponibles y la
 * pantalla contestaba «este soporte no está en el servidor» —que era cierto
 * para la ruta que se estaba mirando, y mentira para el archivo—.
 *
 * Lo mismo le pasaba a `GHOSTSCRIPT_BIN`: `spawn` buscaba un ejecutable
 * llamado `"/usr/bin/gs"`, con comillas, y ningún PDF se optimizaba.
 *
 * ── Por qué se arregla aquí y no en el servidor ─────────────────────────────
 * Quitar las comillas del `.env` del servidor también lo arregla, y hay que
 * hacerlo. Pero entonces la aplicación seguiría rompiéndose en silencio la
 * próxima vez que alguien las escriba —que es lo normal en un `.env`, y lo que
 * hace `dotenv` es justo quitarlas al leerlas—. Aquí depende de nosotros.
 *
 * Solo se quitan las comillas EMPAREJADAS de los extremos. Una ruta que de
 * verdad lleve una comilla en medio se queda como está.
 */
export function leerDelEntorno(
  nombre: string,
  entorno: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const crudo = entorno[nombre]?.trim();
  if (!crudo) return undefined;

  const limpio = sinComillas(crudo);
  return limpio === '' ? undefined : limpio;
}

/** `"algo"` y `'algo'` son `algo`. Lo demás se queda igual. */
export function sinComillas(valor: string): string {
  const primera = valor[0];
  if ((primera === '"' || primera === "'") && valor.length >= 2 && valor.endsWith(primera)) {
    return valor.slice(1, -1).trim();
  }
  return valor;
}

/** Los únicos hosts que cuentan como «mi máquina». */
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

/** La válvula de escape, para cuando apuntar fuera es deliberado. */
export const PERMISO_DE_BASE_REMOTA = 'PERMITIR_BASE_REMOTA';

/** El host de una URL de conexión, o `null` si no se puede leer. */
export function hostDeLaBase(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Por qué esta API NO debería arrancar, o `null` si puede.
 *
 * ── El accidente que esto impide ────────────────────────────────────────────
 * `api/.env` apuntaba al Postgres de producción. Cualquier `npm run dev`,
 * cualquier script de prueba y cualquier experimento escribía en los datos de
 * verdad sin que nada lo dijera. Ya costó un incidente: los recibos subidos en
 * local creaban su ficha en la base compartida y dejaban el archivo en el
 * disco del portátil, así que en producción salían como inexistentes.
 *
 * El error no fue de nadie en particular: era la configuración por defecto.
 *
 * ── Por qué una lista de hosts LOCALES y no «bloquear Supabase» ─────────────
 * Porque la pregunta correcta no es «¿esto es producción?» sino «¿esto es mi
 * máquina?». Nombrar a Supabase deja pasar cualquier otra base remota —una
 * copia en un servidor, la de un compañero— que tampoco debería recibir
 * escrituras de una sesión de desarrollo. Lo que se permite se enumera; lo
 * demás se niega.
 *
 * ── Y por qué hay válvula de escape ─────────────────────────────────────────
 * Porque esto defiende de un DESCUIDO, no de una decisión. Quien de verdad
 * necesite apuntar fuera lo dice en voz alta con `PERMITIR_BASE_REMOTA=si`, y
 * entonces es un acto deliberado que se ve en el entorno y en el registro, no
 * un valor heredado que nadie revisó.
 */
export function porQueNoArrancar(entorno: NodeJS.ProcessEnv = process.env): string | null {
  if ((entorno.NODE_ENV ?? '').trim() === 'production') return null;
  if (leerDelEntorno(PERMISO_DE_BASE_REMOTA, entorno)?.toLowerCase() === 'si') return null;

  const url = leerDelEntorno('DATABASE_URL', entorno);
  if (!url) return null; // Sin URL falla más abajo, con su propio mensaje.

  const host = hostDeLaBase(url);
  if (host === null) return null; // Ilegible: que se queje quien la use.
  if (HOSTS_LOCALES.has(host)) return null;

  return (
    `DATABASE_URL apunta a «${host}», que no es tu máquina, y NODE_ENV no es ` +
    `«production».\n\n` +
    `La API no arranca: una sesión de desarrollo no debe escribir en una base ` +
    `remota. Apunta DATABASE_URL y DIRECT_URL al Postgres local —el mismo de ` +
    `api/.env.migrate— o, si de verdad quieres salir fuera, dilo con ` +
    `${PERMISO_DE_BASE_REMOTA}=si.`
  );
}
