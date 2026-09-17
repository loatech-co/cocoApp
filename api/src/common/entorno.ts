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
export function leerDelEntorno(nombre: string): string | undefined {
  const crudo = process.env[nombre]?.trim();
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
