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
function comoTexto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);
  return '';
}

export function esCorreoRepetido(estado: number, datos: Record<string, unknown> | null): boolean {
  if (estado === 409) return true;
  if (estado !== 422 && estado !== 400) return false;

  const codigo = (comoTexto(datos?.error_code) || comoTexto(datos?.code)).toLowerCase();
  if (codigo === 'email_exists' || codigo === 'user_already_exists') return true;

  // Solo se consulta el texto cuando no vino código: con código, el código
  // manda, y un `msg` que hable de otra cosa no puede contradecirlo.
  if (codigo !== '' && codigo !== '422' && codigo !== '400') return false;

  const mensaje = (comoTexto(datos?.msg) || comoTexto(datos?.message)).toLowerCase();
  return (
    mensaje.includes('already been registered') ||
    mensaje.includes('already registered') ||
    mensaje.includes('already exists')
  );
}
