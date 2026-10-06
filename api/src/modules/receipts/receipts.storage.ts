import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { readEnv } from '../../common/env';

/**
 * El almacén privado de los soportes.
 *
 * ── Por qué fuera del árbol web ─────────────────────────────────────────────
 * Porque un recibo lleva el nombre del titular, un número de cuenta, a veces
 * un consumo que dice si la casa estuvo vacía en agosto. Puesto bajo
 * `public/`, el servidor lo entrega a quien acierte la URL, y una URL se
 * acierta: los nombres de archivo son predecibles y los buscadores indexan
 * directorios. Aquí no hay URL que acertar —no hay ruta pública al archivo—,
 * solo un endpoint que primero comprueba de quién es.
 *
 * ── Por qué la clave la escribe el servidor ─────────────────────────────────
 * `<userId>/<uuid>.<ext>`. Ni una letra viene del nombre original. Con el
 * nombre del usuario en la ruta, un archivo llamado `../../.env` deja de ser
 * una travesura y pasa a ser un incidente; con un uuid, no hay nada que
 * inventar desde fuera. Y aun así se comprueba al resolver: defensa en dos
 * sitios, porque el día que alguien meta una clave a mano el `resolve` es lo
 * único que queda entre eso y el sistema de archivos.
 */

/**
 * Lo único que se acepta. Un SVG, por ejemplo, es un documento ejecutable.
 *
 * @public — nada lo importa: `soportes.contrato.spec.ts` lo lee como texto
 * para comprobar que el contrato publica estos mismos tipos (excepción de knip).
 */
export const ACCEPTED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * La carpeta del almacén.
 *
 * En producción la fija `SOPORTES_DIR` y apunta FUERA de `public_html`. En
 * desarrollo cae a `api/.soportes`, que está en el `.gitignore`: los recibos
 * de verdad no entran al repositorio ni por descuido.
 */
export function storeFolder(): string {
  // `readEnv` y no `process.env` a secas: en el servidor la variable
  // llega con las comillas dentro del valor, y una ruta que empieza por `"` no
  // es absoluta, así que `resolve` la colgaba del directorio de trabajo. Ver
  // `common/env.ts`.
  const declared = readEnv('SOPORTES_DIR');
  if (declared) return resolve(declared);
  return resolve(__dirname, '..', '..', '..', '.soportes');
}

/**
 * ¿Está donde dice que está?
 *
 * Se comprueba al arrancar y se grita si no. El almacén mal apuntado no rompe
 * nada visible: la API sigue en pie, la lista de soportes sigue llegando y lo
 * único que cambia es que TODOS salen como no disponibles. Sin esta línea, eso
 * se diagnostica mirando `/proc/<pid>/environ` del proceso en producción, que
 * es donde acabamos la primera vez.
 */
export function diskStoreStatus(): { folder: string; exists: boolean } {
  const folder = storeFolder();
  return { folder, exists: existsSync(folder) };
}

/**
 * La ruta absoluta de una clave, comprobando que no se sale del almacén.
 *
 * Devuelve `null` en vez de lanzar cuando la clave apunta afuera: para quien
 * pregunta, un archivo que no existe y un archivo que no puede tocar tienen
 * que verse igual.
 */
export function diskPathOf(storageKey: string): string | null {
  const base = storeFolder();
  const target = resolve(base, storageKey);

  // `resolve` ya colapsó los `..`, así que aquí se ve el resultado real. El
  // separador al final del prefijo importa: sin él, `/soportes-otro` pasaría
  // por estar dentro de `/soportes`.
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

/** sha256 del contenido: dos veces el mismo archivo es el mismo soporte. */
export function hashOf(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** La clave que le toca a un archivo nuevo. La escribe el servidor, entera. */
export function newStorageKey(userId: bigint, extension: string): string {
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${userId.toString()}/${randomUUID()}.${ext}`;
}

/** Guarda el binario. No pisa nada: la clave lleva un uuid recién hecho. */
export async function saveToDisk(storageKey: string, content: Buffer): Promise<void> {
  const target = diskPathOf(storageKey);
  if (target === null) throw new Error(`Clave de almacenamiento inválida: ${storageKey}`);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { flag: 'wx' });
}

/** Si el binario está en disco. La ficha puede existir sin él —y al revés—. */
export function exists(storageKey: string): boolean {
  const target = diskPathOf(storageKey);
  return target !== null && existsSync(target);
}

/** El binario, en un flujo. No se carga entero en memoria para entregarlo. */
export function openFromDisk(storageKey: string): ReturnType<typeof createReadStream> | null {
  const target = diskPathOf(storageKey);
  if (target === null || !existsSync(target)) return null;
  return createReadStream(target);
}
