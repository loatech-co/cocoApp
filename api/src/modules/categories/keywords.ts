/**
 * Las palabras clave de un concepto: lo que se busca en un soporte para saber
 * que es suyo.
 *
 * ── Qué hace este archivo ───────────────────────────────────────────────────
 * Una sola cosa: decidir cuándo dos palabras son la MISMA. «Celsia», «celsia »
 * y «CELSIA» lo son, y guardarlas las tres haría que el clasificador sumara
 * tres veces puntos por una sola coincidencia en el recibo.
 *
 * Vive aparte del DTO porque hacen falta en dos sitios que no se parecen: al
 * guardar lo que manda un cliente, y al unificar dos conceptos —donde las
 * palabras del que desaparece pasan al que queda—. Escrito dos veces, un día
 * uno de los dos deja de mirar las tildes.
 *
 * Se guardan TAL COMO se escribieron: bajar a minúsculas al guardar
 * convertiría «Aquaoccidente» en «aquaoccidente» en la pantalla de quien lo
 * escribió. Lo de aquí es la comparación, no el almacenamiento.
 */

/** Sin tildes, en minúscula y con los espacios apretados. Para comparar. */
function comparisonKey(word: string): string {
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Recorta y aprieta los espacios, conservando tildes y mayúsculas. */
function clean(word: string): string {
  return word.replace(/\s+/g, ' ').trim();
}

/**
 * Una lista sin vacías y sin repetidas, en el orden en que llegaron.
 *
 * El orden importa poco para clasificar —todas valen lo mismo— y mucho para
 * quien las lee: reordenarlas haría que la ficha enseñara otra lista de la que
 * se escribió.
 */
export function mergeKeywords(...lists: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const list of lists) {
    for (const raw of list) {
      const word = clean(raw);
      if (word === '') continue;

      const key = comparisonKey(word);
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(word);
    }
  }

  return merged;
}
