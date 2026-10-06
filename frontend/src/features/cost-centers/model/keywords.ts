import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { toSearchableNodes } from '@/shared/lib/searchable-tree';
import {
  treeSignatures as sharedTreeSignatures,
  normalize,
  type Signature,
} from '@coco/receipt-parser';

/**
 * Las palabras que alguien escribe en un concepto para que sus recibos se
 * reconozcan solos.
 *
 * ── Por qué el usuario tiene que poder escribirlas ──────────────────────────
 * Porque el catálogo de firmas —`packages/receipt-parser/src/signatures.ts`— se sacó de 443
 * soportes reales, y eso es exactamente lo que le pasa: sabe reconocer a los
 * acreedores de QUIEN los trajo. El primer recibo de una inmobiliaria que no
 * está ahí no se reconoce, y la única salida era abrir el código.
 *
 * Con las palabras clave, quien tiene el recibo delante escribe lo que dice
 * —«Comfandi», el NIT— y el siguiente se clasifica solo. Es el mismo trato que
 * ya tiene la categorización de extractos, que aprende del historial: el
 * sistema no adivina mejor que la persona, aprende de ella.
 *
 * ── Lo que aquí NO se hace ──────────────────────────────────────────────────
 * Guardar las palabras en minúscula y sin tildes. Se comparan así, pero se
 * guardan como se escribieron: «Aquaoccidente» en la ficha tiene que seguir
 * diciendo «Aquaoccidente».
 */

/**
 * El largo mínimo de una palabra clave.
 *
 * Dos letras aparecen DENTRO de otras palabras —«ao» está en «pago», «da» en
 * «fecha»— y una firma que coincide con cualquier recibo no clasifica: barre.
 * El catálogo tiene abreviaturas de dos letras, pero ancladas al principio del
 * nombre del archivo (`prefijosDeNombre`), que es otra cosa; lo que se escribe
 * aquí se busca suelto en todo el texto.
 */
export const MIN_LENGTH = 3;

/** Lo que admite la API. Se repite aquí para no dejar escribir lo que se va a rechazar. */
export const MAX_KEYWORDS = 30;
const MAX_LENGTH = 60;

/** Sin tildes, en minúscula y con los espacios apretados. Para comparar, no para guardar. */
function comparisonKey(keyword: string): string {
  return normalize(keyword);
}

/**
 * Recorta y aprieta los espacios. Lo que se guarda: con sus tildes y sus
 * mayúsculas.
 */
export function cleanKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, ' ').trim();
}

/** ¿Esta lista ya tiene esta palabra? Sin mirar tildes ni mayúsculas. */
export function includesKeyword(keywords: readonly string[], keyword: string): boolean {
  const wanted = comparisonKey(keyword);
  return keywords.some((kept) => comparisonKey(kept) === wanted);
}

/**
 * Parte lo que se escribió o se pegó en palabras sueltas.
 *
 * La coma separa porque es como se pega una lista —«Celsia, EPSA, 805027653»—
 * y porque nadie escribe un acreedor con una coma dentro. El salto de línea,
 * porque copiar tres renglones de un recibo es el otro gesto.
 */
export function splitKeywords(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map(cleanKeyword)
    .filter((keyword) => keyword !== '');
}

/** Por qué una palabra no entra. `null` si entra. */
export function rejectionReason(keyword: string, existing: readonly string[]): string | null {
  const cleaned = cleanKeyword(keyword);

  if (cleaned.length < MIN_LENGTH) {
    return t('centers.keywords.tooShort', { word: cleaned, min: MIN_LENGTH });
  }
  if (cleaned.length > MAX_LENGTH) {
    return t('centers.keywords.tooLong', { start: cleaned.slice(0, 20) });
  }
  if (includesKeyword(existing, cleaned)) {
    return t('centers.keywords.duplicate', { word: cleaned });
  }
  if (existing.length >= MAX_KEYWORDS) {
    return t('centers.keywords.tooMany', { max: MAX_KEYWORDS });
  }

  return null;
}

/** Los conceptos del árbol: las hojas, que es donde cuelgan los movimientos. */
function conceptsOf(tree: readonly CategoryTree[]): {
  concept: CategoryTree;
  category: CategoryTree;
  costCenter: CategoryTree;
}[] {
  return tree.flatMap((costCenter) =>
    (costCenter.children ?? []).flatMap((category) =>
      (category.children ?? []).map((concept) => ({ concept, category, costCenter })),
    ),
  );
}

/**
 * Qué OTRO concepto ya usa esta palabra.
 *
 * ── Por qué se avisa en vez de prohibirlo ───────────────────────────────────
 * Porque una palabra en dos conceptos no rompe nada —el clasificador elige uno
 * y sigue— pero sí hace que la misma factura caiga un mes en «Energía» y otro
 * en «Internet» sin que nadie entienda por qué. Es la misma clase de aviso que
 * el del concepto duplicado: se dice lo que hay y se deja decidir.
 */
export function conceptAlreadyUsing(
  tree: readonly CategoryTree[],
  keyword: string,
  exceptId?: CategoryTree['id'],
): CategoryTree | undefined {
  const wanted = comparisonKey(keyword);

  return conceptsOf(tree).find(
    ({ concept }) =>
      concept.id !== exceptId && concept.keywords.some((kept) => comparisonKey(kept) === wanted),
  )?.concept;
}

/**
 * Las firmas que salen del árbol de alguien.
 *
 * Van DELANTE del catálogo cuando se clasifica, y además con más prioridad:
 * ver `TYPED_TEXT_PRIORITY` en `packages/receipt-parser/src/signatures.ts`.
 */
export function treeSignatures(tree: readonly CategoryTree[]): Signature[] {
  // El recorrido vive en el paquete desde la fase 3: la API lo necesita igual.
  return sharedTreeSignatures(toSearchableNodes(tree));
}
