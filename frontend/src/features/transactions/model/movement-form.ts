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

import type { Origen } from './precedence';

/** Un concepto que la lectura dejó entre lo que dudar, para el buscador. */
export interface CandidatoDelRecibo {
  id: number;
  nombre: string;
  ruta: string;
}

/**
 * Lo que una fuente automática propone para clasificar.
 *
 * `candidatos`, cuando viene, REEMPLAZA los que el buscador tenía a la vista;
 * sin él, se quedan los que había.
 */
export interface AutoProposal {
  categoryId: number | undefined;
  origen: Origen;
  candidatos?: CandidatoDelRecibo[];
}

export function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `expense` → "gasto". El tipo, dicho como se dice. */
export function nombreDelTipo(tipo: TransactionType): string {
  return tipo === 'income'
    ? t('transactions.types.incomeNoun')
    : t('transactions.types.expenseNoun');
}

export function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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
  movimiento: Transaction | null | undefined,
  pago: PendingPayment | null | undefined,
): { amount: string; date: string } {
  const abonandoAUnConcepto = pago?.isMultiPayment === true;

  return {
    amount: movimiento
      ? String(Number(movimiento.amount))
      : !abonandoAUnConcepto && pago?.expectedAmount != null
        ? String(Number(pago.expectedAmount))
        : '',
    date:
      movimiento?.date ?? (abonandoAUnConcepto ? hoyEnBogota() : (pago?.dueDate ?? hoyEnBogota())),
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
function conceptoLlamado(arbol: CategoryTree[], nombre: string): CategoryTree | undefined {
  const buscado = normalize(nombre);

  for (const centro of arbol) {
    for (const categoria of centro.children ?? []) {
      for (const concepto of categoria.children ?? []) {
        if (normalize(concepto.name) === buscado) return concepto;
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
  indice: readonly IndexEntry[],
  escrito: string,
): AutoProposal | null {
  const conceptos = searchInTree(indice, escrito).filter((e) => e.level === 'concepto');
  const [unico] = conceptos;
  if (conceptos.length === 1 && unico !== undefined) {
    return { categoryId: Number(unico.id), origen: 'palabras-clave' };
  }

  const terminos = termsFor(escrito);
  if (terminos.length === 0) return null;
  const resuelto = resolveTerms(indice, terminos);
  if (resuelto.certainty === 'alta' && resuelto.concept) {
    return { categoryId: Number(resuelto.concept.id), origen: 'diccionario' };
  }
  if (resuelto.certainty === 'media') {
    const candidatos = resuelto.candidates.map((c) => ({
      id: Number(c.id),
      nombre: c.name,
      ruta: c.path.join(' › '),
    }));
    return {
      categoryId: resuelto.category ? Number(resuelto.category.id) : undefined,
      origen: 'diccionario',
      // Del texto, solo se ponen a la vista si hay alguno.
      ...(candidatos.length > 0 ? { candidatos } : {}),
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
export function proposalFromReading(leida: Reading, arbol: CategoryTree[]): AutoProposal | null {
  const enElArbol = leida.inTree;
  if (!enElArbol) {
    const suyo = leida.concept ? conceptoLlamado(arbol, leida.concept) : undefined;
    return suyo ? { categoryId: suyo.id, origen: 'palabras-clave' } : null;
  }

  const origen: Origen =
    enElArbol.source === 'diccionario'
      ? 'diccionario'
      : enElArbol.source === 'historial'
        ? 'historial'
        : 'palabras-clave';

  if (enElArbol.certainty === 'alta' && enElArbol.conceptId !== undefined) {
    return { categoryId: Number(enElArbol.conceptId), origen };
  }
  if (enElArbol.certainty === 'media') {
    return {
      categoryId: enElArbol.categoryId !== undefined ? Number(enElArbol.categoryId) : undefined,
      origen,
      candidatos: enElArbol.candidates.map((c) => ({
        id: Number(c.id),
        nombre: c.name,
        ruta: c.path,
      })),
    };
  }
  // Hubo lectura en el árbol, aunque no alcanzó para proponer nada.
  return { categoryId: undefined, origen };
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
export function unreadNotice(leida: Reading, texto: string): string | null {
  const algoUtil = leida.value !== null || leida.date !== null || leida.concept !== null;
  if (algoUtil) return null;
  return texto.trim() === ''
    ? t('transactions.reading.noText')
    : t('transactions.reading.noAmountNorDate');
}
