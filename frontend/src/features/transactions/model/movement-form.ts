import { type CategoryTree } from '@/shared/api/categories';
import {
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import {
  searchInTree,
  normalize,
  resolveTerms,
  termsFor,
  type IndexEntry,
  type Reading,
} from '@coco/receipt-parser';

import type { Origin } from './precedence';

/** Un concepto que la lectura dejó entre lo que dudar, para el buscador. */
export interface ReceiptCandidate {
  id: number;
  name: string;
  path: string;
}

/**
 * Lo que una fuente automática propone para clasificar.
 *
 * `candidatos`, cuando viene, REEMPLAZA los que el buscador tenía a la vista;
 * sin él, se quedan los que había.
 */
export interface AutoProposal {
  categoryId: number | undefined;
  origin: Origin;
  candidates?: ReceiptCandidate[];
}

export function todayInBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `expense` → "gasto". El tipo, dicho como se dice. */
export function typeName(type: TransactionType): string {
  return type === 'income'
    ? t('transactions.types.incomeNoun')
    : t('transactions.types.expenseNoun');
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * El valor y la fecha con los que nace la ficha.
 *
 * Confirmando un pago, nacen puestos. Son lo ESPERADO: el promedio de los
 * meses que sí se pagaron y el día en que vencía. No son el dato bueno —el
 * dato bueno lo dice el recibo— pero son mucho mejor que una caja vacía, y el
 * gesto que los corrige es adjuntar el soporte, que es a lo que se viene.
 *
 * Un valor esperado que nadie corrige se registra como si fuera el real, y por
 * eso la cabecera lo dice con todas las letras en vez de dejar que parezca un
 * dato.
 *
 * ── Lo que se cubre a pedazos entra VACÍO, y con la fecha de hoy ────────────
 * Un concepto normal se confirma: lo que se espera que cueste es lo que va a
 * costar, y traerlo escrito ahorra el paso. Uno que se paga en varias veces no
 * se confirma, se ABONA: lo que trae la cabeza de quien abre esta ficha es lo
 * que acaba de gastar en el supermercado, y el total del mes no tiene nada que
 * ver con eso.
 *
 * Poner ahí 1.200.000 —el presupuesto entero— sería la peor sugerencia
 * posible: al primer «guardar» sin mirar, el mes queda cubierto de golpe y el
 * concepto sale de la lista como si ya estuviera resuelto.
 *
 * Y la fecha es HOY y no el vencimiento, por lo mismo: la ida al mercado fue
 * hoy. El día 1 es cuándo empieza a contar el ciclo, no cuándo se gastó esto.
 */
export function initialAmountAndDate(
  transaction: Transaction | null | undefined,
  payment: PendingPayment | null | undefined,
): { amount: string; date: string } {
  const isPayingIntoConcept = payment?.isMultiPayment === true;

  return {
    amount: transaction
      ? String(Number(transaction.amount))
      : !isPayingIntoConcept && payment?.expectedAmount != null
        ? String(Number(payment.expectedAmount))
        : '',
    date:
      transaction?.date ??
      (isPayingIntoConcept ? todayInBogota() : (payment?.dueDate ?? todayInBogota())),
  };
}

/**
 * Busca un concepto por su nombre en el árbol.
 *
 * Sin distinguir mayúsculas ni tildes: lo que devuelve el clasificador viene
 * de una tabla de firmas escrita a mano, y lo que hay en el árbol lo escribió
 * una persona. "Celsia (Energia)" y "Celsia (Energía)" son el mismo concepto y
 * no hay ninguna razón para que un acento los separe.
 */
function conceptNamed(tree: CategoryTree[], name: string): CategoryTree | undefined {
  const wanted = normalize(name);

  for (const costCenter of tree) {
    for (const category of costCenter.children ?? []) {
      for (const concept of category.children ?? []) {
        if (normalize(concept.name) === wanted) return concept;
      }
    }
  }
  return undefined;
}

/**
 * Lo que lo ESCRITO propone: las palabras clave y los nombres de la persona en
 * su árbol, y si no, el diccionario del sistema.
 *
 * Si lleva a un solo concepto, se propone. Si el diccionario lleva a una
 * categoría o a varios conceptos, se propone la categoría y los candidatos
 * quedan a la vista en el buscador.
 */
export function proposalFromText(
  index: readonly IndexEntry[],
  written: string,
): AutoProposal | null {
  const concepts = searchInTree(index, written).filter((e) => e.level === 'concepto');
  const [single] = concepts;
  if (concepts.length === 1 && single !== undefined) {
    return { categoryId: Number(single.id), origin: 'palabras-clave' };
  }

  const terms = termsFor(written);
  if (terms.length === 0) return null;
  const resolved = resolveTerms(index, terms);
  if (resolved.certainty === 'alta' && resolved.concept) {
    return { categoryId: Number(resolved.concept.id), origin: 'diccionario' };
  }
  if (resolved.certainty === 'media') {
    const candidates = resolved.candidates.map((c) => ({
      id: Number(c.id),
      name: c.name,
      path: c.path.join(' › '),
    }));
    return {
      categoryId: resolved.category ? Number(resolved.category.id) : undefined,
      origin: 'diccionario',
      // Del texto, solo se ponen a la vista si hay alguno.
      ...(candidates.length > 0 ? { candidates } : {}),
    };
  }
  return null;
}

/**
 * Lo que el recibo dice de la clasificación, por su fuente y su certeza.
 *
 * Con ids cuando los hay —`enElArbol`—: alta propone el concepto; media
 * propone la categoría, si la hay, y deja los candidatos a la vista en el
 * buscador para que la persona elija. Nunca se adivina entre varios.
 *
 * Las palabras clave de la persona y el catálogo van con rango de palabras
 * clave; el diccionario, con el suyo. Sin ids —un árbol que no llegó—, por el
 * nombre, como siempre. `null` si el recibo no dijo nada de esto.
 */
export function proposalFromReading(reading: Reading, tree: CategoryTree[]): AutoProposal | null {
  const inTree = reading.inTree;
  if (!inTree) {
    const own = reading.concept ? conceptNamed(tree, reading.concept) : undefined;
    return own ? { categoryId: own.id, origin: 'palabras-clave' } : null;
  }

  const origin: Origin =
    inTree.source === 'diccionario'
      ? 'diccionario'
      : inTree.source === 'historial'
        ? 'historial'
        : 'palabras-clave';

  if (inTree.certainty === 'alta' && inTree.conceptId !== undefined) {
    return { categoryId: Number(inTree.conceptId), origin };
  }
  if (inTree.certainty === 'media') {
    return {
      categoryId: inTree.categoryId !== undefined ? Number(inTree.categoryId) : undefined,
      origin,
      candidates: inTree.candidates.map((c) => ({
        id: Number(c.id),
        name: c.name,
        path: c.path,
      })),
    };
  }
  // Hubo lectura en el árbol, aunque no alcanzó para proponer nada.
  return { categoryId: undefined, origin };
}

/**
 * Qué decir cuando leer no sacó nada útil, o `null` si sí sacó algo.
 *
 * ── Leer y no sacar nada NO es haber leído ──────────────────────────────────
 * Antes se anunciaba «Los datos se extrajeron del soporte» pasara lo que
 * pasara, incluso con los tres campos vacíos. Y hay dos maneras de no sacar
 * nada, que no se arreglan igual:
 *
 * · No se pudo sacar TEXTO del archivo —un PDF que no abre, una imagen que el
 *   reconocimiento no descifra—. Ahí no hay nada que revisar.
 * · Se sacó el texto pero no se reconoció ni valor ni fecha ni concepto. Ahí
 *   el documento sí se leyó; lo que no cuadró es su forma.
 *
 * En los dos casos el archivo se queda adjunto: se subió para guardarlo, no
 * solo para leerlo.
 */
export function unreadNotice(reading: Reading, text: string): string | null {
  const hasSomethingUseful =
    reading.value !== null || reading.date !== null || reading.concept !== null;
  if (hasSomethingUseful) return null;
  return text.trim() === ''
    ? t('transactions.reading.noText')
    : t('transactions.reading.noAmountNorDate');
}
