/**
 * Description normalization, for comparing what a receipt or a bank text
 * says against learned rules.
 *
 * It lived in `imports/fingerprint.ts` next to the import dedupe hash. The
 * import endpoints were retired in phase 6.6 and categorization is its only
 * user, so it moved here unchanged; the hash went with the importer.
 */

/**
 * Ruido que los extractos meten en la descripción y que cambia entre lecturas
 * del MISMO movimiento. Si no se quitara, la huella nunca coincidiría y el
 * dedupe no serviría de nada.
 */
const NOISE: RegExp[] = [
  // Referencias de transacción: "REF 000123456", "AUT 45219".
  /\b(?:ref|aut|apr|autoriz\w*|comprobante|cus|doc)[\s.:#-]*\d{3,}\b/g,
  // Fragmentos de tarjeta: "****1234", "XXXX 5678", "terminada en 1234".
  // Sin `\b` delante: entre un espacio y un `*` NO hay frontera de palabra
  // —ninguno de los dos es carácter de palabra— y el patrón nunca casaría.
  /(?:[*x]{2,}\s*\d{4}|\bterminada\s+en\s+\d{4}\b)/g,
  // Fechas y horas incrustadas.
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
  // Coletillas de banco que no distinguen un movimiento de otro.
  /\b(?:compra|pago|pse|debito|credito|transaccion|trans)\b/g,
];

/**
 * Normaliza una descripción para comparar.
 *
 * Minúsculas, sin tildes, sin ruido, sin puntuación y con los espacios
 * colapsados. `Éxito Poblado  REF 0012` y `EXITO POBLADO ref 9987` acaban
 * siendo la misma cadena, que es exactamente lo que se busca: el mismo
 * comercio leído dos veces.
 *
 * ── Sobre la ñ ─────────────────────────────────────────────────────────────
 * Se pliega a `n`, aunque en español sean letras distintas. La entrada de esta
 * función es texto de OCR, y la virgulilla es justo la clase de marca que un
 * OCR pierde: el mismo comercio saldría "Peñalisa" una vez y "Penalisa" otra,
 * y la huella dejaría de coincidir — que es el fallo que esta función existe
 * para evitar.
 *
 * El costo del pliegue es que dos comercios que solo se diferencien por la ñ
 * podrían marcarse como repetidos. Para que eso ocurra tendrían que coincidir
 * ADEMÁS en cuenta, fecha y monto al centavo, y aun entonces solo se marca:
 * la persona desmarca la casilla. El fallo contrario —duplicados que se cuelan
 * sin avisar— es mucho más caro de descubrir y de limpiar.
 */
export function normalizeDescription(text: string | null | undefined): string {
  if (!text) return '';

  let result = text
    .toLowerCase()
    // NFD separa cada letra de su marca diacrítica; el rango ̀-ͯ son
    // esas marcas. Incluye la virgulilla de la ñ, que aquí se pliega a propósito.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  for (const pattern of NOISE) {
    result = result.replace(pattern, ' ');
  }

  return result
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
