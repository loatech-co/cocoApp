import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

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

/** Lo único que se acepta. Un SVG, por ejemplo, es un documento ejecutable. */
export const TIPOS_ACEPTADOS: Record<string, string> = {
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
export function carpetaDelAlmacen(): string {
  const declarada = process.env.SOPORTES_DIR?.trim();
  if (declarada) return resolve(declarada);
  return resolve(__dirname, '..', '..', '..', '.soportes');
}

/**
 * La ruta absoluta de una clave, comprobando que no se sale del almacén.
 *
 * Devuelve `null` en vez de lanzar cuando la clave apunta afuera: para quien
 * pregunta, un archivo que no existe y un archivo que no puede tocar tienen
 * que verse igual.
 */
export function rutaDe(storageKey: string): string | null {
  const base = carpetaDelAlmacen();
  const destino = resolve(base, storageKey);

  // `resolve` ya colapsó los `..`, así que aquí se ve el resultado real. El
  // separador al final del prefijo importa: sin él, `/soportes-otro` pasaría
  // por estar dentro de `/soportes`.
  if (destino !== base && !destino.startsWith(base + sep)) return null;
  return destino;
}

/** sha256 del contenido: dos veces el mismo archivo es el mismo soporte. */
export function huellaDe(contenido: Buffer): string {
  return createHash('sha256').update(contenido).digest('hex');
}

/** La clave que le toca a un archivo nuevo. La escribe el servidor, entera. */
export function claveNueva(userId: bigint, extension: string): string {
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${userId.toString()}/${randomUUID()}.${ext}`;
}

/** Guarda el binario. No pisa nada: la clave lleva un uuid recién hecho. */
export async function guardar(storageKey: string, contenido: Buffer): Promise<void> {
  const destino = rutaDe(storageKey);
  if (destino === null) throw new Error(`Clave de almacenamiento inválida: ${storageKey}`);

  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, contenido, { flag: 'wx' });
}

/** Si el binario está en disco. La ficha puede existir sin él —y al revés—. */
export function existe(storageKey: string): boolean {
  const destino = rutaDe(storageKey);
  return destino !== null && existsSync(destino);
}

/** El binario, en un flujo. No se carga entero en memoria para entregarlo. */
export function abrir(storageKey: string): ReturnType<typeof createReadStream> | null {
  const destino = rutaDe(storageKey);
  if (destino === null || !existsSync(destino)) return null;
  return createReadStream(destino);
}

/** La ruta de una clave, para los scripts que escriben directo en el almacén. */
export function rutaAbsoluta(storageKey: string): string {
  const destino = rutaDe(storageKey);
  if (destino === null) throw new Error(`Clave de almacenamiento inválida: ${storageKey}`);
  return join(destino);
}
