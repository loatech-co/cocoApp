import {
  SIGNATURES,
  classify,
  treeSignatures,
  indexTree,
  readablePath,
  type IndexEntry,
  type SearchableNode,
} from '@coco/receipt-parser';

/**
 * El cerebro: de un texto o de unos datos, a un gasto interpretado.
 *
 * ── Por qué está en la API y no solo en el navegador ────────────────────────
 * La interpretación vivía en `@coco/receipt-parser` y corría solo en el navegador. La
 * API no clasificaba, no sabía de dónde venía un gasto y descartaba el texto
 * leído; una app externa no tenía a quién preguntarle. Ahora el paquete corre
 * aquí tal cual —no se movió ni se duplicó— y la web usa el mismo motor.
 *
 * ── Las fuentes, en su orden ────────────────────────────────────────────────
 * 1. El HISTORIAL de la persona: lo que el servidor sabe porque así lo
 *    clasificó antes. Aquí sí está disponible, que es lo que el navegador no
 *    podía tener.
 * 2. Sus PALABRAS CLAVE, y el catálogo de firmas del sistema.
 * 3. El DICCIONARIO del sistema, cuando nadie reconoció al acreedor.
 * Una fuente inferior nunca reemplaza a una superior.
 *
 * ── Y la certeza ────────────────────────────────────────────────────────────
 * ALTA es un concepto concreto. MEDIA es una categoría, o varios conceptos
 * entre los que no se elige. NINGUNA es nada. Con lo que no sea alta, quien
 * capture guarda sin clasificar o con la categoría, y marca para revisar.
 * Nunca se adivina.
 *
 * Es una función pura: todo lo que necesita —el árbol, la sugerencia del
 * historial— se lo da quien la llama, que es quien tiene la base.
 */
export type InterpretedCertainty = 'alta' | 'media' | 'ninguna';
export type InterpretedSource = 'historial' | 'palabras-clave' | 'firma' | 'diccionario';

export interface InterpretationInput {
  /** Texto libre: el OCR de un recibo, el SMS del banco. */
  text?: string | null | undefined;
  /** O datos ya estructurados, como los entrega el disparador de Wallet. */
  merchant?: string | null | undefined;
  amount?: string | number | null | undefined;
  /** `YYYY-MM-DD`. */
  date?: string | null | undefined;
  fileName?: string | null | undefined;
  /** El mes al que pertenece, `YYYY-MM`. Ayuda a elegir la fecha. */
  period?: string | null | undefined;
}

export interface InterpretationContext {
  /** El árbol de la persona, con ids como cadenas. */
  tree: readonly SearchableNode[];
  /** Lo que el historial sugiere para este texto, si algo. */
  history: { categoryId: string; confidence: number } | null;
  /** Hoy, `YYYY-MM-DD`, para no aceptar fechas futuras de un OCR torcido. */
  today: string;
}

export interface InterpretedClassification {
  certainty: InterpretedCertainty;
  source: InterpretedSource | null;
  conceptId: string | null;
  categoryId: string | null;
  name: string | null;
  candidates: { id: string; name: string; path: string }[];
  reason: string;
}

export interface Interpreted {
  amount: string | null;
  date: string | null;
  merchant: string | null;
  description: string | null;
  classification: InterpretedClassification;
  needsReview: boolean;
}

/**
 * Por encima de esto, una sugerencia del historial vale como certeza ALTA.
 *
 * El historial contesta con un porcentaje de dominio: 100 cuando todo lo
 * parecido fue a la misma categoría, 85 para una regla que la persona creó,
 * 60 para una regla sembrada. Con 80 se cuelan la unanimidad y las reglas
 * propias, y se quedan fuera las sembradas y los historiales repartidos, que
 * es justo lo que no debería guardarse sin que alguien lo mire.
 */
export const SAFE_HISTORY_CONFIDENCE = 80;

export function interpret(input: InterpretationInput, context: InterpretationContext): Interpreted {
  const index = indexTree(context.tree);
  const freeText = (input.text ?? '').trim();
  const merchant = (input.merchant ?? '').trim();

  // Lo que se le da a leer: el texto si lo hay; si no, el comercio solo. Un
  // comercio es un texto muy corto, y el lector sabe sacar de ahí el acreedor
  // aunque no haya monto ni fecha que leer.
  const reading = classify({
    text: freeText || merchant,
    source: 'texto-embebido',
    fileName: input.fileName ?? undefined,
    period: input.period ?? undefined,
    signatures: [...treeSignatures(context.tree), ...SIGNATURES],
    tree: context.tree,
  });

  // Lo estructurado manda sobre lo leído: si quien captura ya sabe el monto,
  // no hay nada que adivinar en el texto.
  const amount = amountOf(input.amount) ?? (reading.value === null ? null : String(reading.value));
  const date = validDate(input.date, context.today) ?? validDate(reading.date, context.today);

  const classification = classifyWith(context, index, reading.inTree ?? null, {
    concept: reading.concept,
    category: reading.category,
    reason: reading.reason,
  });

  return {
    amount,
    date,
    merchant: merchant || reading.concept || null,
    // La descripción es lo que se lee de un vistazo en la tabla: el comercio
    // si se sabe; si no, el concepto reconocido; si no, nada.
    description: merchant || reading.concept || null,
    classification,
    // Falta algo que alguien tiene que poner —el monto, la fecha— o la
    // clasificación no es segura: a revisar.
    needsReview: classification.certainty !== 'alta' || amount === null || date === null,
  };
}

function classifyWith(
  context: InterpretationContext,
  index: readonly IndexEntry[],
  inTree: NonNullable<ReturnType<typeof classify>['inTree']> | null,
  parsed: { concept: string | null; category: string | null; reason: string },
): InterpretedClassification {
  return (
    byHistory(context, index) ??
    (inTree ? byReading(index, inTree, parsed) : null) ?? {
      certainty: 'ninguna',
      source: null,
      conceptId: null,
      categoryId: null,
      name: null,
      candidates: [],
      reason: parsed.reason,
    }
  );
}

/** 1. El historial, si tiene algo que decir. */
function byHistory(
  context: InterpretationContext,
  index: readonly IndexEntry[],
): InterpretedClassification | null {
  const { history } = context;
  if (history) {
    const entry = index.find((e) => String(e.id) === history.categoryId);
    if (entry && entry.level !== 'centro') {
      const isHigh = history.confidence >= SAFE_HISTORY_CONFIDENCE;
      return {
        certainty: isHigh ? 'alta' : 'media',
        source: 'historial',
        conceptId: entry.level === 'concepto' ? String(entry.id) : null,
        categoryId: entry.level === 'concepto' ? String(entry.categoryId) : String(entry.id),
        name: entry.name,
        candidates: isHigh
          ? []
          : [{ id: String(entry.id), name: entry.name, path: readablePath(entry) }],
        reason: isHigh
          ? `Tu historial lo clasifica así (${history.confidence}% de las veces).`
          : `Tu historial apunta aquí, pero no siempre (${history.confidence}%): mejor míralo.`,
      };
    }
  }
  return null;
}

/** 2 y 3. Lo que la lectura reconoció, por palabras clave, firma o diccionario. */
function byReading(
  index: readonly IndexEntry[],
  inTree: NonNullable<ReturnType<typeof classify>['inTree']>,
  parsed: { reason: string; concept: string | null; category: string | null },
): InterpretedClassification {
  const concept =
    inTree.conceptId !== undefined
      ? index.find((e) => String(e.id) === String(inTree.conceptId))
      : undefined;
  const category =
    inTree.categoryId !== undefined
      ? index.find((e) => String(e.id) === String(inTree.categoryId))
      : undefined;
  return {
    certainty: inTree.certainty,
    source: inTree.source,
    conceptId: concept ? String(concept.id) : null,
    categoryId: category ? String(category.id) : concept ? String(concept.categoryId) : null,
    name: concept?.name ?? category?.name ?? parsed.concept ?? parsed.category,
    candidates: inTree.candidates.map((c) => ({
      id: String(c.id),
      name: c.name,
      path: c.path,
    })),
    reason: parsed.reason,
  };
}

/** Un monto estructurado, como cadena decimal, o `null` si no sirve. */
function amountOf(amount: string | number | null | undefined): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = typeof amount === 'number' ? amount : Number(amount.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/** `YYYY-MM-DD`, real y no futura. Lo demás es `null`. */
function validDate(date: string | null | undefined, today: string): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (Number.isNaN(Date.parse(date))) return null;
  if (date > today) return null;
  return date;
}

/**
 * Para una notificación: «Registrado: $45.000 · Alimentación», o «Pendiente
 * de clasificar». Tres palabras, que es como se lee una notificación.
 */
export function summaryOf(
  amount: string | null,
  classification: InterpretedClassification,
): string {
  const shownAmount = amount === null ? null : pesos(amount);
  if (classification.certainty === 'alta' && classification.name) {
    return `Registrado: ${shownAmount ?? 'sin valor'} · ${classification.name}`;
  }
  if (classification.certainty === 'media' && classification.name) {
    return `Registrado: ${shownAmount ?? 'sin valor'} · ${classification.name} (por revisar)`;
  }
  return shownAmount
    ? `Registrado: ${shownAmount} · Pendiente de clasificar`
    : 'Pendiente de clasificar';
}

/** `45000` → `$45.000`. Sin decimales: así se escribe la plata aquí. */
export function pesos(amount: string | number): string {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.abs(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}
