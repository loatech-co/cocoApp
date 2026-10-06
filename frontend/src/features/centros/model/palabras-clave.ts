import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { toSearchableNodes } from '@/shared/lib/searchable-tree';
import {
  treeSignatures as firmasDelArbolCompartido,
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
export const LARGO_MINIMO = 3;

/** Lo que admite la API. Se repite aquí para no dejar escribir lo que se va a rechazar. */
export const MAXIMO_DE_PALABRAS = 30;
const LARGO_MAXIMO = 60;

/** Sin tildes, en minúscula y con los espacios apretados. Para comparar, no para guardar. */
function comoSeCompara(palabra: string): string {
  return normalize(palabra);
}

/**
 * Recorta y aprieta los espacios. Lo que se guarda: con sus tildes y sus
 * mayúsculas.
 */
export function limpiar(palabra: string): string {
  return palabra.replace(/\s+/g, ' ').trim();
}

/** ¿Esta lista ya tiene esta palabra? Sin mirar tildes ni mayúsculas. */
export function yaEsta(palabras: readonly string[], palabra: string): boolean {
  const buscada = comoSeCompara(palabra);
  return palabras.some((suya) => comoSeCompara(suya) === buscada);
}

/**
 * Parte lo que se escribió o se pegó en palabras sueltas.
 *
 * La coma separa porque es como se pega una lista —«Celsia, EPSA, 805027653»—
 * y porque nadie escribe un acreedor con una coma dentro. El salto de línea,
 * porque copiar tres renglones de un recibo es el otro gesto.
 */
export function partir(escrito: string): string[] {
  return escrito
    .split(/[,\n]/)
    .map(limpiar)
    .filter((palabra) => palabra !== '');
}

/** Por qué una palabra no entra. `null` si entra. */
export function porQueNoEntra(palabra: string, yaPuestas: readonly string[]): string | null {
  const limpia = limpiar(palabra);

  if (limpia.length < LARGO_MINIMO) {
    return t('centers.keywords.tooShort', { word: limpia, min: LARGO_MINIMO });
  }
  if (limpia.length > LARGO_MAXIMO) {
    return t('centers.keywords.tooLong', { start: limpia.slice(0, 20) });
  }
  if (yaEsta(yaPuestas, limpia)) {
    return t('centers.keywords.duplicate', { word: limpia });
  }
  if (yaPuestas.length >= MAXIMO_DE_PALABRAS) {
    return t('centers.keywords.tooMany', { max: MAXIMO_DE_PALABRAS });
  }

  return null;
}

/** Los conceptos del árbol: las hojas, que es donde cuelgan los movimientos. */
function conceptosDe(arbol: readonly CategoryTree[]): {
  concepto: CategoryTree;
  categoria: CategoryTree;
  centro: CategoryTree;
}[] {
  return arbol.flatMap((centro) =>
    (centro.children ?? []).flatMap((categoria) =>
      (categoria.children ?? []).map((concepto) => ({ concepto, categoria, centro })),
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
export function conceptoQueYaLaUsa(
  arbol: readonly CategoryTree[],
  palabra: string,
  exceptoId?: CategoryTree['id'],
): CategoryTree | undefined {
  const buscada = comoSeCompara(palabra);

  return conceptosDe(arbol).find(
    ({ concepto }) =>
      concepto.id !== exceptoId &&
      concepto.keywords.some((suya) => comoSeCompara(suya) === buscada),
  )?.concepto;
}

/**
 * Las firmas que salen del árbol de alguien.
 *
 * Van DELANTE del catálogo cuando se clasifica, y además con más prioridad:
 * ver `TYPED_TEXT_PRIORITY` en `packages/receipt-parser/src/signatures.ts`.
 */
export function firmasDelArbol(arbol: readonly CategoryTree[]): Signature[] {
  // El recorrido vive en el paquete desde la fase 3: la API lo necesita igual.
  return firmasDelArbolCompartido(toSearchableNodes(arbol));
}
