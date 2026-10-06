import { readAmount } from './amount';
import { readDate } from './date';
import { merchantsIn } from './dictionary';
import {
  indexTree,
  resolveTerms,
  readablePath,
  type ClassificationCertainty,
  type IndexEntry,
  type SearchableNode,
} from './search';
import {
  SIGNATURES,
  TYPED_TEXT_PRIORITY,
  COLLECTORS,
  normalize,
  type Signature,
} from './signatures';

/**
 * De qué es este soporte, cuánto y cuándo.
 *
 * ── Por qué varias señales y no una ────────────────────────────────────────
 * Porque cada señal falla de una forma distinta. El texto embebido es exacto
 * pero no está en un PDF escaneado. El OCR está siempre pero confunde letras.
 * El nombre del archivo es lo que una persona escribió sabiendo de qué era
 * —la señal más inteligente— pero también la que nadie garantiza. Juntas se
 * corrigen: donde dos coinciden, la tercera no hace falta; donde discrepan, lo
 * que hay que hacer no es elegir, es avisar.
 *
 * ── Por qué el puntaje se devuelve y no se esconde ──────────────────────────
 * Porque una clasificación automática que no dice cuánto se cree a sí misma
 * obliga a revisarlo todo o a no revisar nada. Con el puntaje, lo seguro pasa
 * solo y lo dudoso va a una cola, que es el único reparto que ahorra trabajo
 * de verdad.
 */

export interface ReadingSignals {
  /** Aliases del contenido que coincidieron. */
  texto: string[];
  /** Trozos del nombre del archivo que coincidieron. */
  nombre: string[];
  /** NITs que coincidieron. La señal más fuerte. */
  nit: string[];
  /** Recaudadores encontrados y descartados como acreedor. */
  recaudadoresIgnorados: string[];
}

/**
 * La clasificación llevada al árbol de la persona, por ids.
 *
 * Los nombres de `Lectura` son para leerlos; esto es para ELEGIR: un
 * concepto se elige por id, y dos «Mercado» en categorías distintas tienen el
 * mismo nombre y distinto id. Solo existe cuando se pasó el árbol.
 *
 * ── Las tres fuentes y su orden ─────────────────────────────────────────────
 * `palabras-clave` son las de la persona —lo que escribió en un concepto para
 * reconocerlo— y van primero; `firma` es el catálogo del sistema; y el
 * `diccionario` solo habla cuando ninguna de las dos reconoció nada. Una
 * fuente inferior nunca reemplaza a una superior.
 *
 * ── Y la certeza ────────────────────────────────────────────────────────────
 * ALTA es un concepto; MEDIA es una categoría o varios conceptos entre los que
 * no se elige; NINGUNA no se devuelve: entonces esto es `null`.
 */
export interface TreeClassification {
  certeza: Exclude<ClassificationCertainty, 'ninguna'>;
  /** `historial` no lo produce el paquete: lo añade la API, que es quien lo tiene. */
  fuente: 'historial' | 'palabras-clave' | 'firma' | 'diccionario';
  conceptoId?: number | string | undefined;
  categoriaId?: number | string | undefined;
  /** Con certeza media: entre qué se duda, para dejarlo a la vista. */
  candidatos: { id: number | string; nombre: string; ruta: string }[];
}

export interface Reading {
  concepto: string | null;
  categoria: string | null;
  centro: string | null;
  valor: number | null;
  fecha: string | null;
  /** 0 a 1. Por debajo de 0,8 se manda a revisar. */
  confianza: number;
  señales: ReadingSignals;
  /** Por qué se decidió así, en una línea, para la cola de revisión. */
  motivo: string;
  /** Los otros candidatos, por si la persona quiere corregir de un clic. */
  alternativas: { concepto: string; puntaje: number }[];
  /** Por ids, cuando se pasó el árbol. `null` si no se pasó o no llevó a nada. */
  enElArbol?: TreeClassification | null;
}

export interface ReadingInput {
  /** El texto del recibo: embebido del PDF o salido del OCR. */
  texto: string;
  /** Cómo se obtuvo. El embebido es exacto; el OCR confunde letras. */
  fuente: 'texto-embebido' | 'ocr';
  /** El nombre del archivo y, si existe, el de su carpeta. */
  nombreDeArchivo?: string | undefined;
  /** El mes al que pertenece el gasto, `YYYY-MM`. Ayuda a elegir la fecha. */
  periodo?: string | undefined;
  /** Las firmas a usar. Por defecto, el catálogo. */
  firmas?: Signature[];
  /**
   * El árbol de la persona. Con él, la lectura devuelve ids y no solo nombres,
   * y el diccionario del sistema puede buscar sus términos ahí dentro.
   */
  arbol?: readonly SearchableNode[];
}

/** Cuánto pesa cada señal. Suman hasta 100 y de ahí sale la confianza. */
const WEIGHTS = {
  nit: 45,
  aliasEnTexto: 30,
  tokenEnNombre: 18,
  prefijoEnNombre: 10,
} as const;

export function classify(input: ReadingInput): Reading {
  const signatures = input.firmas ?? SIGNATURES;
  const text = normalize(input.texto);
  const name = normalize(input.nombreDeArchivo ?? '');
  const index = input.arbol ? indexTree(input.arbol) : null;

  const signals: ReadingSignals = {
    texto: [],
    nombre: [],
    nit: [],
    recaudadoresIgnorados: [],
  };

  /*
    Los recaudadores se anotan y se descartan.

    Aparecen en casi todos los recibos porque son por donde pasó la plata. Se
    dejan en las señales a propósito: que el informe diga "vi Bancolombia y lo
    ignoré" es lo que permite entender una clasificación rara sin abrir el
    archivo.
  */
  for (const collector of COLLECTORS) {
    if (text.includes(collector)) signals.recaudadoresIgnorados.push(collector);
  }

  const scored = signatures.map((signature) => {
    let points = 0;
    const own: { texto: string[]; nombre: string[]; nit: string[] } = {
      texto: [],
      nombre: [],
      nit: [],
    };

    // Lo que descarta esta firma aunque todo lo demás coincida.
    const isDiscarded = (signature.excluye ?? []).some((e) => text.includes(normalize(e)));

    for (const nit of signature.nits ?? []) {
      if (text.replace(/[.\s-]/g, '').includes(nit.replace(/[.\s-]/g, ''))) {
        points += WEIGHTS.nit;
        own.nit.push(nit);
      }
    }

    for (const alias of signature.alias) {
      if (text.includes(normalize(alias))) {
        points += WEIGHTS.aliasEnTexto;
        own.texto.push(alias);
        break;
      }
    }

    for (const token of signature.tokensDeNombre ?? []) {
      if (name.includes(normalize(token))) {
        points += WEIGHTS.tokenEnNombre;
        own.nombre.push(token);
      }
    }

    // Las abreviaturas solo valen ancladas al principio: "AO" en medio de una
    // palabra no dice nada, "ao - agosto.pdf" sí.
    for (const prefix of signature.prefijosDeNombre ?? []) {
      if (new RegExp(`^${prefix}\\b`, 'i').test(name)) {
        points += WEIGHTS.prefijoEnNombre;
        own.nombre.push(prefix.toUpperCase());
      }
    }

    return {
      firma: signature,
      puntos: isDiscarded ? 0 : points,
      suyas: own,
      descartada: isDiscarded,
    };
  });

  const alive = scored.filter((p) => p.puntos > 0);

  // Prioridad ANTES que puntaje: es lo que pone la planilla por encima de Sura
  // cuando el recibo dice las dos cosas.
  alive.sort((a, b) => (b.firma.prioridad ?? 0) - (a.firma.prioridad ?? 0) || b.puntos - a.puntos);

  const winner = alive[0];

  if (!winner) {
    const {
      valor: value,
      fecha: date,
      confianzaDelValor: valueConfidence,
    } = valueAndDate(input, undefined);

    /*
      ── Última fuente: el diccionario del sistema ──────────────────────────
      Ninguna firma reconoció al acreedor —ni las palabras clave de la persona
      ni el catálogo—. Antes de rendirse se mira si el texto nombra un
      comercio conocido del país, y a qué llaman eso en ESTE árbol: «KOBA
      COLOMBIA» es D1, D1 es «mercado», y mercado es lo que esa persona tenga
      que se llame así o lo tenga por palabra clave.

      Solo con el árbol delante: sin él no hay dónde buscar los términos, y
      devolver «mercado» como nombre sería inventar un concepto que quizá no
      existe.
    */
    const dictionaryReading = index
      ? fromDictionary(index, input, signals, value, date, valueConfidence)
      : null;
    if (dictionaryReading) return dictionaryReading;

    return {
      concepto: null,
      categoria: null,
      centro: null,
      valor: value,
      fecha: date,
      // Sin acreedor no hay clasificación, por mucho que el valor esté claro.
      confianza: Math.min(0.35, valueConfidence),
      señales: signals,
      motivo: 'No reconocí al acreedor en el texto ni en el nombre del archivo.',
      alternativas: [],
      enElArbol: null,
    };
  }

  signals.texto = winner.suyas.texto;
  signals.nombre = winner.suyas.nombre;
  signals.nit = winner.suyas.nit;

  const {
    valor: value,
    fecha: date,
    confianzaDelValor: valueConfidence,
  } = valueAndDate(input, winner.firma);

  /*
    La confianza.

    Sale de tres cosas y no de una: cuánto se reconoció al acreedor, de dónde
    salió el texto —el OCR se equivoca y hay que decirlo— y si el valor se leyó
    de una línea que nombra un total o se sacó a puro pulso.

    Y baja cuando el segundo candidato queda cerca: dos firmas empatadas no es
    un acierto con reservas, es una duda.
  */
  const creditorScore = Math.min(1, winner.puntos / 60);
  const sourceFactor = input.fuente === 'texto-embebido' ? 1 : 0.8;
  /*
    El margen no baja de 0,6, que es lo que vale un empate.

    La ganadora no siempre es la que más puntos saca: la prioridad va antes, y
    una firma escrita a mano gana a una del catálogo que reconoció el NIT. Sin
    suelo, esa resta se vuelve negativa y el término del acreedor no rebaja la
    confianza: la RESTA, hasta llevarse por delante lo que el valor ya había
    ganado. Un soporte perfectamente leído acababa con menos confianza que uno
    del que no se sacó nada.

    Ganar por prioridad y no por puntos es exactamente una duda, y una duda es
    un empate: 0,6.
  */
  const runnerUp = alive[1];
  const margin =
    runnerUp && runnerUp.puntos > 0
      ? Math.max(0.6, Math.min(1, 0.6 + (winner.puntos - runnerUp.puntos) / 60))
      : 1;

  const confidence = Math.max(
    0,
    Math.min(1, creditorScore * 0.55 * sourceFactor * margin + valueConfidence * 0.45),
  );

  return {
    concepto: winner.firma.concepto,
    categoria: winner.firma.categoria,
    centro: winner.firma.centro,
    valor: value,
    fecha: date,
    confianza: Math.round(confidence * 100) / 100,
    señales: signals,
    motivo: reasonFor(winner.firma, signals, input.fuente),
    alternativas: alive.slice(1, 4).map((v) => ({ concepto: v.firma.concepto, puntaje: v.puntos })),
    enElArbol: index ? treeClassificationFromSignature(index, winner.firma) : null,
  };
}

/**
 * Una firma ganadora, llevada a ids.
 *
 * La firma trae nombres —concepto, categoría, centro— porque así se escribe
 * el catálogo y así salen de `firmasDeConceptos`. Se busca en el índice el
 * concepto que se llame igual Y cuelgue de la misma categoría: dos «Mercado»
 * en categorías distintas no son el mismo.
 */
function treeClassificationFromSignature(
  index: readonly IndexEntry[],
  signature: Signature,
): TreeClassification {
  const concept = index.find(
    (e) =>
      e.nivel === 'concepto' &&
      normalize(e.nombre) === normalize(signature.concepto) &&
      normalize(e.ruta[0] ?? '') === normalize(signature.categoria),
  );
  return {
    certeza: 'alta',
    fuente: signature.prioridad === TYPED_TEXT_PRIORITY ? 'palabras-clave' : 'firma',
    conceptoId: concept?.id,
    categoriaId: concept?.categoriaId,
    candidatos: [],
  };
}

/**
 * Lo que el diccionario del sistema dice de un texto, o `null` si nada.
 *
 * La confianza queda SIEMPRE por debajo del umbral de revisión, a propósito:
 * el diccionario propone, no decide. Un comercio reconocido es una buena
 * pista de dónde va la plata, pero no es una firma —no sabe nada de ESTA
 * cuenta—, y lo que sale de aquí tiene que pasar por los ojos de alguien.
 */
function fromDictionary(
  index: readonly IndexEntry[],
  input: ReadingInput,
  signals: ReadingSignals,
  value: number | null,
  date: string | null,
  valueConfidence: number,
): Reading | null {
  const found = merchantsIn(`${input.texto} ${input.nombreDeArchivo ?? ''}`);
  const [firstFound] = found;
  if (firstFound === undefined) return null;

  const terms = [...new Set(found.flatMap((h) => h.grupo.terminos))];
  const resolved = resolveTerms(index, terms);
  if (resolved.certeza === 'ninguna') return null;

  const concept = resolved.concepto;
  const category =
    resolved.categoria ??
    (concept
      ? index.find((e) => e.nivel === 'categoria' && String(e.id) === String(concept.categoriaId))
      : undefined);

  const merchant = firstFound.alias;
  const reason =
    resolved.certeza === 'alta'
      ? `Reconocí «${merchant}» y en tu árbol eso lleva a un solo concepto.`
      : resolved.candidatos.length > 1
        ? `Reconocí «${merchant}», pero en tu árbol lleva a ${resolved.candidatos.length} sitios: elige tú.`
        : `Reconocí «${merchant}» y en tu árbol lleva a una categoría, sin concepto.`;

  return {
    concepto: concept?.nombre ?? null,
    categoria: category?.nombre ?? null,
    centro: concept?.ruta[1] ?? category?.ruta[0] ?? null,
    valor: value,
    fecha: date,
    confianza:
      resolved.certeza === 'alta'
        ? Math.round(Math.min(0.75, 0.5 + valueConfidence * 0.25) * 100) / 100
        : Math.round(Math.min(0.5, 0.3 + valueConfidence * 0.2) * 100) / 100,
    señales: signals,
    motivo: reason,
    alternativas: resolved.candidatos.map((c) => ({ concepto: c.nombre, puntaje: 0 })),
    enElArbol: {
      certeza: resolved.certeza,
      fuente: 'diccionario',
      conceptoId: concept?.id,
      categoriaId: category?.id ?? concept?.categoriaId,
      candidatos: resolved.candidatos.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        ruta: readablePath(c),
      })),
    },
  };
}

/** El valor y la fecha, con lo que sepamos del acreedor. */
function valueAndDate(
  input: ReadingInput,
  signature: Signature | undefined,
): { valor: number | null; fecha: string | null; confianzaDelValor: number } {
  const isPayroll = signature?.concepto === 'PILA / Seguridad Social';
  const amount = readAmount(input.texto, { esPlanilla: isPayroll, rango: signature?.rango });
  const date = readDate(input.texto, input.periodo);

  if (!amount) return { valor: null, fecha: date?.iso ?? null, confianzaDelValor: 0 };

  let trust = amount.deLineaDeTotal ? 0.9 : 0.5;
  // Fuera del rango que este acreedor suele cobrar: puede ser cierto —un
  // recibo atrasado, un año de póliza— pero merece que alguien lo mire.
  if (
    signature?.rango &&
    (amount.valor < signature.rango.min || amount.valor > signature.rango.max)
  ) {
    trust -= 0.35;
  }
  // Una fecha inventada no invalida el valor, pero tampoco lo respalda.
  if (date && !date.enElPeriodo) trust -= 0.1;

  return {
    valor: amount.valor,
    fecha: date?.iso ?? null,
    confianzaDelValor: Math.max(0, Math.min(1, trust)),
  };
}

function reasonFor(signature: Signature, signals: ReadingSignals, source: string): string {
  const parts: string[] = [];
  if (signals.nit.length > 0) parts.push(`NIT ${signals.nit.join(', ')}`);
  if (signals.texto.length > 0) parts.push(`“${signals.texto.join('”, “')}” en el texto`);
  if (signals.nombre.length > 0) parts.push(`“${signals.nombre.join('”, “')}” en el nombre`);

  const cause = parts.length > 0 ? parts.join(' + ') : 'sin señales claras';
  const ignored =
    signals.recaudadoresIgnorados.length > 0
      ? `. Ignoré ${signals.recaudadoresIgnorados.join(', ')} por ser recaudador`
      : '';

  return `${signature.concepto} por ${cause} (${source})${ignored}.`;
}

/** Por debajo de esto, a la cola de revisión. */
export const REVIEW_THRESHOLD = 0.8;

export function needsReview(reading: Reading): boolean {
  return (
    reading.confianza < REVIEW_THRESHOLD || reading.concepto === null || reading.valor === null
  );
}
