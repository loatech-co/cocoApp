import {
  indexarArbol,
  resolverTerminos,
  rutaLegible,
  type Certeza,
  type EntradaDelIndice,
  type NodoBuscable,
} from './buscar';
import { comerciosEn } from './diccionario';
import { leerFecha } from './fecha';
import { FIRMAS, PRIORIDAD_DE_LO_ESCRITO, RECAUDADORES, normalizar, type Firma } from './firmas';
import { leerMonto } from './monto';

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

export interface SeñalesDeLectura {
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
export interface ClasificacionEnElArbol {
  certeza: Exclude<Certeza, 'ninguna'>;
  /** `historial` no lo produce el paquete: lo añade la API, que es quien lo tiene. */
  fuente: 'historial' | 'palabras-clave' | 'firma' | 'diccionario';
  conceptoId?: number | string | undefined;
  categoriaId?: number | string | undefined;
  /** Con certeza media: entre qué se duda, para dejarlo a la vista. */
  candidatos: { id: number | string; nombre: string; ruta: string }[];
}

export interface Lectura {
  concepto: string | null;
  categoria: string | null;
  centro: string | null;
  valor: number | null;
  fecha: string | null;
  /** 0 a 1. Por debajo de 0,8 se manda a revisar. */
  confianza: number;
  señales: SeñalesDeLectura;
  /** Por qué se decidió así, en una línea, para la cola de revisión. */
  motivo: string;
  /** Los otros candidatos, por si la persona quiere corregir de un clic. */
  alternativas: { concepto: string; puntaje: number }[];
  /** Por ids, cuando se pasó el árbol. `null` si no se pasó o no llevó a nada. */
  enElArbol?: ClasificacionEnElArbol | null;
}

export interface EntradaDeLectura {
  /** El texto del recibo: embebido del PDF o salido del OCR. */
  texto: string;
  /** Cómo se obtuvo. El embebido es exacto; el OCR confunde letras. */
  fuente: 'texto-embebido' | 'ocr';
  /** El nombre del archivo y, si existe, el de su carpeta. */
  nombreDeArchivo?: string | undefined;
  /** El mes al que pertenece el gasto, `YYYY-MM`. Ayuda a elegir la fecha. */
  periodo?: string | undefined;
  /** Las firmas a usar. Por defecto, el catálogo. */
  firmas?: Firma[];
  /**
   * El árbol de la persona. Con él, la lectura devuelve ids y no solo nombres,
   * y el diccionario del sistema puede buscar sus términos ahí dentro.
   */
  arbol?: readonly NodoBuscable[];
}

/** Cuánto pesa cada señal. Suman hasta 100 y de ahí sale la confianza. */
const PESOS = {
  nit: 45,
  aliasEnTexto: 30,
  tokenEnNombre: 18,
  prefijoEnNombre: 10,
} as const;

export function clasificar(entrada: EntradaDeLectura): Lectura {
  const firmas = entrada.firmas ?? FIRMAS;
  const texto = normalizar(entrada.texto);
  const nombre = normalizar(entrada.nombreDeArchivo ?? '');
  const indice = entrada.arbol ? indexarArbol(entrada.arbol) : null;

  const señales: SeñalesDeLectura = {
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
  for (const banco of RECAUDADORES) {
    if (texto.includes(banco)) señales.recaudadoresIgnorados.push(banco);
  }

  const puntuadas = firmas.map((firma) => {
    let puntos = 0;
    const suyas: { texto: string[]; nombre: string[]; nit: string[] } = {
      texto: [],
      nombre: [],
      nit: [],
    };

    // Lo que descarta esta firma aunque todo lo demás coincida.
    const descartada = (firma.excluye ?? []).some((e) => texto.includes(normalizar(e)));

    for (const nit of firma.nits ?? []) {
      if (texto.replace(/[.\s-]/g, '').includes(nit.replace(/[.\s-]/g, ''))) {
        puntos += PESOS.nit;
        suyas.nit.push(nit);
      }
    }

    for (const alias of firma.alias) {
      if (texto.includes(normalizar(alias))) {
        puntos += PESOS.aliasEnTexto;
        suyas.texto.push(alias);
        break;
      }
    }

    for (const token of firma.tokensDeNombre ?? []) {
      if (nombre.includes(normalizar(token))) {
        puntos += PESOS.tokenEnNombre;
        suyas.nombre.push(token);
      }
    }

    // Las abreviaturas solo valen ancladas al principio: "AO" en medio de una
    // palabra no dice nada, "ao - agosto.pdf" sí.
    for (const prefijo of firma.prefijosDeNombre ?? []) {
      if (new RegExp(`^${prefijo}\\b`, 'i').test(nombre)) {
        puntos += PESOS.prefijoEnNombre;
        suyas.nombre.push(prefijo.toUpperCase());
      }
    }

    return { firma, puntos: descartada ? 0 : puntos, suyas, descartada };
  });

  const vivas = puntuadas.filter((p) => p.puntos > 0);

  // Prioridad ANTES que puntaje: es lo que pone la planilla por encima de Sura
  // cuando el recibo dice las dos cosas.
  vivas.sort((a, b) => (b.firma.prioridad ?? 0) - (a.firma.prioridad ?? 0) || b.puntos - a.puntos);

  const ganadora = vivas[0];

  if (!ganadora) {
    const { valor, fecha, confianzaDelValor } = datos(entrada, undefined);

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
    const delDiccionario = indice
      ? desdeElDiccionario(indice, entrada, señales, valor, fecha, confianzaDelValor)
      : null;
    if (delDiccionario) return delDiccionario;

    return {
      concepto: null,
      categoria: null,
      centro: null,
      valor,
      fecha,
      // Sin acreedor no hay clasificación, por mucho que el valor esté claro.
      confianza: Math.min(0.35, confianzaDelValor),
      señales,
      motivo: 'No reconocí al acreedor en el texto ni en el nombre del archivo.',
      alternativas: [],
      enElArbol: null,
    };
  }

  señales.texto = ganadora.suyas.texto;
  señales.nombre = ganadora.suyas.nombre;
  señales.nit = ganadora.suyas.nit;

  const { valor, fecha, confianzaDelValor } = datos(entrada, ganadora.firma);

  /*
    La confianza.

    Sale de tres cosas y no de una: cuánto se reconoció al acreedor, de dónde
    salió el texto —el OCR se equivoca y hay que decirlo— y si el valor se leyó
    de una línea que nombra un total o se sacó a puro pulso.

    Y baja cuando el segundo candidato queda cerca: dos firmas empatadas no es
    un acierto con reservas, es una duda.
  */
  const deAcreedor = Math.min(1, ganadora.puntos / 60);
  const porFuente = entrada.fuente === 'texto-embebido' ? 1 : 0.8;
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
  const segundo = vivas[1];
  const margen =
    segundo && segundo.puntos > 0
      ? Math.max(0.6, Math.min(1, 0.6 + (ganadora.puntos - segundo.puntos) / 60))
      : 1;

  const confianza = Math.max(
    0,
    Math.min(1, deAcreedor * 0.55 * porFuente * margen + confianzaDelValor * 0.45),
  );

  return {
    concepto: ganadora.firma.concepto,
    categoria: ganadora.firma.categoria,
    centro: ganadora.firma.centro,
    valor,
    fecha,
    confianza: Math.round(confianza * 100) / 100,
    señales,
    motivo: motivoDe(ganadora.firma, señales, entrada.fuente),
    alternativas: vivas.slice(1, 4).map((v) => ({ concepto: v.firma.concepto, puntaje: v.puntos })),
    enElArbol: indice ? enElArbolDesdeFirma(indice, ganadora.firma) : null,
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
function enElArbolDesdeFirma(
  indice: readonly EntradaDelIndice[],
  firma: Firma,
): ClasificacionEnElArbol {
  const concepto = indice.find(
    (e) =>
      e.nivel === 'concepto' &&
      normalizar(e.nombre) === normalizar(firma.concepto) &&
      normalizar(e.ruta[0] ?? '') === normalizar(firma.categoria),
  );
  return {
    certeza: 'alta',
    fuente: firma.prioridad === PRIORIDAD_DE_LO_ESCRITO ? 'palabras-clave' : 'firma',
    conceptoId: concepto?.id,
    categoriaId: concepto?.categoriaId,
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
function desdeElDiccionario(
  indice: readonly EntradaDelIndice[],
  entrada: EntradaDeLectura,
  señales: SeñalesDeLectura,
  valor: number | null,
  fecha: string | null,
  confianzaDelValor: number,
): Lectura | null {
  const hallados = comerciosEn(`${entrada.texto} ${entrada.nombreDeArchivo ?? ''}`);
  const [primerHallado] = hallados;
  if (primerHallado === undefined) return null;

  const terminos = [...new Set(hallados.flatMap((h) => h.grupo.terminos))];
  const resuelto = resolverTerminos(indice, terminos);
  if (resuelto.certeza === 'ninguna') return null;

  const concepto = resuelto.concepto;
  const categoria =
    resuelto.categoria ??
    (concepto
      ? indice.find((e) => e.nivel === 'categoria' && String(e.id) === String(concepto.categoriaId))
      : undefined);

  const comercio = primerHallado.alias;
  const motivo =
    resuelto.certeza === 'alta'
      ? `Reconocí «${comercio}» y en tu árbol eso lleva a un solo concepto.`
      : resuelto.candidatos.length > 1
        ? `Reconocí «${comercio}», pero en tu árbol lleva a ${resuelto.candidatos.length} sitios: elige tú.`
        : `Reconocí «${comercio}» y en tu árbol lleva a una categoría, sin concepto.`;

  return {
    concepto: concepto?.nombre ?? null,
    categoria: categoria?.nombre ?? null,
    centro: concepto?.ruta[1] ?? categoria?.ruta[0] ?? null,
    valor,
    fecha,
    confianza:
      resuelto.certeza === 'alta'
        ? Math.round(Math.min(0.75, 0.5 + confianzaDelValor * 0.25) * 100) / 100
        : Math.round(Math.min(0.5, 0.3 + confianzaDelValor * 0.2) * 100) / 100,
    señales,
    motivo,
    alternativas: resuelto.candidatos.map((c) => ({ concepto: c.nombre, puntaje: 0 })),
    enElArbol: {
      certeza: resuelto.certeza,
      fuente: 'diccionario',
      conceptoId: concepto?.id,
      categoriaId: categoria?.id ?? concepto?.categoriaId,
      candidatos: resuelto.candidatos.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        ruta: rutaLegible(c),
      })),
    },
  };
}

/** El valor y la fecha, con lo que sepamos del acreedor. */
function datos(
  entrada: EntradaDeLectura,
  firma: Firma | undefined,
): { valor: number | null; fecha: string | null; confianzaDelValor: number } {
  const esPlanilla = firma?.concepto === 'PILA / Seguridad Social';
  const monto = leerMonto(entrada.texto, { esPlanilla, rango: firma?.rango });
  const fecha = leerFecha(entrada.texto, entrada.periodo);

  if (!monto) return { valor: null, fecha: fecha?.iso ?? null, confianzaDelValor: 0 };

  let seguridad = monto.deLineaDeTotal ? 0.9 : 0.5;
  // Fuera del rango que este acreedor suele cobrar: puede ser cierto —un
  // recibo atrasado, un año de póliza— pero merece que alguien lo mire.
  if (firma?.rango && (monto.valor < firma.rango.min || monto.valor > firma.rango.max)) {
    seguridad -= 0.35;
  }
  // Una fecha inventada no invalida el valor, pero tampoco lo respalda.
  if (fecha && !fecha.enElPeriodo) seguridad -= 0.1;

  return {
    valor: monto.valor,
    fecha: fecha?.iso ?? null,
    confianzaDelValor: Math.max(0, Math.min(1, seguridad)),
  };
}

function motivoDe(firma: Firma, señales: SeñalesDeLectura, fuente: string): string {
  const partes: string[] = [];
  if (señales.nit.length > 0) partes.push(`NIT ${señales.nit.join(', ')}`);
  if (señales.texto.length > 0) partes.push(`“${señales.texto.join('”, “')}” en el texto`);
  if (señales.nombre.length > 0) partes.push(`“${señales.nombre.join('”, “')}” en el nombre`);

  const razon = partes.length > 0 ? partes.join(' + ') : 'sin señales claras';
  const ignorados =
    señales.recaudadoresIgnorados.length > 0
      ? `. Ignoré ${señales.recaudadoresIgnorados.join(', ')} por ser recaudador`
      : '';

  return `${firma.concepto} por ${razon} (${fuente})${ignorados}.`;
}

/** Por debajo de esto, a la cola de revisión. */
export const UMBRAL_DE_REVISION = 0.8;

export function necesitaRevision(lectura: Lectura): boolean {
  return (
    lectura.confianza < UMBRAL_DE_REVISION || lectura.concepto === null || lectura.valor === null
  );
}
