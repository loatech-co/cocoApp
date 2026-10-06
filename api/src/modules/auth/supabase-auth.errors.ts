/**
 * Qué contesta GoTrue cuando el correo ya está registrado.
 *
 * ── Por qué vive aparte del servicio ────────────────────────────────────────
 * Porque es lógica pura y hay que poder probarla. `supabase-auth.service.ts`
 * importa `jose`, que es solo ESM, y Jest —que corre en CommonJS— no lo puede
 * cargar: importar el servicio desde una prueba revienta antes de llegar a la
 * primera comprobación. Esa es la razón de que esta función se exportara «para
 * poder probarla» y llevara meses sin una sola prueba.
 *
 * Es el mismo recurso que ya usan `pendientes.ts`, `categories.tree.ts` y
 * `common/env.ts`: lo que se puede decidir sin red ni base vive en su
 * propio archivo, sin dependencias.
 */

/**
 * Una propiedad del cuerpo de GoTrue, como texto, solo si de verdad lo es.
 *
 * El cuerpo llega como `Record<string, unknown>`: cualquier campo puede ser un
 * objeto. `String()` sobre uno devuelve «[object Object]», que después se
 * comparaba contra códigos de error como si fuera un dato — una cadena que no
 * dice nada y que nunca coincide, pero que tampoco es vacía, así que apagaba
 * el respaldo por mensaje.
 *
 * El número sí se acepta: las versiones viejas de GoTrue mandan `code: 422`.
 */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

export function isDuplicateEmail(status: number, data: Record<string, unknown> | null): boolean {
  if (status === 409) return true;
  if (status !== 422 && status !== 400) return false;

  const code = (asText(data?.error_code) || asText(data?.code)).toLowerCase();
  if (code === 'email_exists' || code === 'user_already_exists') return true;

  // Solo se consulta el texto cuando no vino código: con código, el código
  // manda, y un `msg` que hable de otra cosa no puede contradecirlo.
  if (code !== '' && code !== '422' && code !== '400') return false;

  const message = (asText(data?.msg) || asText(data?.message)).toLowerCase();
  return (
    message.includes('already been registered') ||
    message.includes('already registered') ||
    message.includes('already exists')
  );
}
