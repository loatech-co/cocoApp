import { FIRMAS, RECAUDADORES, normalizar, type Firma } from './firmas';
import { leerFecha } from './fecha';
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
}

export interface EntradaDeLectura {
  /** El texto del recibo: embebido del PDF o salido del OCR. */
  texto: string;
  /** Cómo se obtuvo. El embebido es exacto; el OCR confunde letras. */
  fuente: 'texto-embebido' | 'ocr';
  /** El nombre del archivo y, si existe, el de su carpeta. */
  nombreDeArchivo?: string;
  /** El mes al que pertenece el gasto, `YYYY-MM`. Ayuda a elegir la fecha. */
  periodo?: string;
  /** Las firmas a usar. Por defecto, el catálogo. */
  firmas?: Firma[];
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
  vivas.sort(
    (a, b) =>
      (b.firma.prioridad ?? 0) - (a.firma.prioridad ?? 0) || b.puntos - a.puntos,
  );

  const ganadora = vivas[0];

  if (!ganadora) {
    const { valor, fecha, confianzaDelValor } = datos(entrada, undefined);
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
    alternativas: vivas
      .slice(1, 4)
      .map((v) => ({ concepto: v.firma.concepto, puntaje: v.puntos })),
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
    lectura.confianza < UMBRAL_DE_REVISION ||
    lectura.concepto === null ||
    lectura.valor === null
  );
}
