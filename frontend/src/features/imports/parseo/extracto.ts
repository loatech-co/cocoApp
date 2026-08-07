import { encontrarFecha } from './fecha';
import { encontrarMontos, type MontoLeido } from './monto';

/**
 * Convierte el texto de un extracto en movimientos candidatos.
 *
 * ── Qué NO hace ─────────────────────────────────────────────────────────────
 * No acierta siempre, y no pretende hacerlo. Un OCR sobre un screenshot torcido
 * produce basura, y ningún parser lo arregla. Por eso el resultado va a una
 * pantalla de revisión donde la persona corrige antes de que nada toque sus
 * finanzas: el parser ahorra trabajo, no reemplaza el criterio.
 *
 * Lo que sí tiene que hacer bien es NO equivocarse en silencio. Cuando duda,
 * marca la fila con un aviso en vez de inventar un dato plausible.
 */

export interface MovimientoCandidato {
  date: string;
  amount: string;
  type: 'expense' | 'income';
  description: string;
  /** Qué línea del documento lo produjo. Se muestra al revisar. */
  lineaOriginal: string;
  /** Dudas del parser sobre esta fila. Vacío si no hay ninguna. */
  avisos: string[];
}

export interface ResultadoDeParseo {
  movimientos: MovimientoCandidato[];
  /** Líneas con cifras que no se pudieron interpretar. Se enseñan para que no
   *  se pierdan en silencio: si el extracto traía 40 movimientos y salieron 12,
   *  hay que poder verlo. */
  lineasIgnoradas: string[];
  /** Si se dedujo que la última columna era un saldo corriente. */
  huboColumnaDeSaldo: boolean;
}

/**
 * Palabras que delatan un ingreso en un extracto colombiano.
 *
 * Sin esto, todo entraría como gasto y habría que corregir cada consignación a
 * mano. Con esto se acierta en la mayoría, y lo que falle se corrige en la
 * revisión, que es donde toca.
 */
const INGRESO = /\b(abono|consignacion|consignación|deposito|depósito|nomina|nómina|transferencia recibida|pago recibido|devolucion|devolución|reintegro|intereses|rendimiento)\b/i;

/** Líneas de encabezado o pie que nunca son movimientos. */
const NO_ES_MOVIMIENTO =
  /\b(saldo (?:anterior|final|inicial|disponible|total)|total (?:cargos|abonos|movimientos)|cupo (?:total|disponible)|pagina|página|estado de cuenta|extracto|corte|fecha de pago|pago minimo|pago mínimo)\b/i;

/**
 * Números que NO son dinero y que hay que borrar antes de buscar montos.
 *
 * Sin esto, `TRANSFERENCIA REF 000123456` produce un movimiento de $456 salido
 * de la nada: el buscador de montos ve la referencia y la toma por una cifra.
 * Inventar dinero es el peor fallo posible en esta app, mucho peor que no
 * reconocer una línea.
 */
const NO_ES_DINERO: RegExp[] = [
  // Referencias: "REF 000123456", "AUT 4521", "COMPROBANTE 998877".
  /\b(?:ref|aut|apr|autoriz\w*|comprobante|cus|doc|nro|no)[\s.:#-]*\d{3,}/gi,
  // Fragmentos de tarjeta: "****1234", "XXXX 5678".
  /(?:[*x]{2,}\s*\d{4})/gi,
  /\bterminada\s+en\s+\d{4}\b/gi,
];

/**
 * Borra el ruido conservando las POSICIONES.
 *
 * Se sustituye por espacios en vez de recortar: los índices que devuelve el
 * buscador de montos se usan después para recortar la descripción, y correrlos
 * la dejaría cortada por sitios arbitrarios.
 */
/** Tapa la fecha, que también aporta cifras que no son dinero. */
function taparLaFecha(linea: string, fecha: { inicio: number; fin: number } | null): string {
  if (!fecha) return linea;
  return (
    linea.slice(0, fecha.inicio) +
    ' '.repeat(fecha.fin - fecha.inicio) +
    linea.slice(fecha.fin)
  );
}

function taparLoQueNoEsDinero(linea: string): string {
  let resultado = linea;
  for (const patron of NO_ES_DINERO) {
    resultado = resultado.replace(patron, (coincidencia) => ' '.repeat(coincidencia.length));
  }
  return resultado;
}

export function parsearExtracto(
  texto: string,
  opciones: { anioPorDefecto?: number } = {},
): ResultadoDeParseo {
  const anio = opciones.anioPorDefecto ?? new Date().getFullYear();

  const lineas = texto
    .split(/\r?\n/)
    .map((linea) => linea.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const leidas = lineas.map((linea) => {
    const fecha = encontrarFecha(linea, anio);

    // Los montos y la descripción se leen sobre la línea SIN la fecha ni las
    // referencias. Sobre la línea cruda pasan dos cosas, las dos malas:
    //   · `REF 000123456` se convierte en un movimiento de $456 salido de la nada.
    //   · `01/08/2026` aporta un "202" que cuenta como cifra y dispara avisos
    //     de "esta línea traía 3 cifras" en líneas perfectamente normales.
    const limpia = taparLoQueNoEsDinero(taparLaFecha(linea, fecha));

    return {
      linea,
      limpia,
      fecha,
      montos: encontrarMontos(limpia),
      descartable: NO_ES_MOVIMIENTO.test(linea),
    };
  });

  const candidatas = leidas.filter((l) => !l.descartable && l.montos.length > 0);
  const huboColumnaDeSaldo = laUltimaColumnaEsUnSaldo(candidatas.map((l) => l.montos));

  const movimientos: MovimientoCandidato[] = [];
  const lineasIgnoradas: string[] = [];
  let ultimaFecha: string | null = null;

  for (const leida of leidas) {
    if (leida.fecha) ultimaFecha = leida.fecha.iso;

    if (leida.descartable) continue;
    if (leida.montos.length === 0) continue;

    const fecha = leida.fecha?.iso ?? ultimaFecha;
    if (!fecha) {
      // Sin fecha no hay movimiento. Se guarda la línea para que se vea que se
      // ignoró, en vez de desaparecer.
      lineasIgnoradas.push(leida.linea);
      continue;
    }

    const elegido = elegirMonto(leida.montos, huboColumnaDeSaldo);
    const descripcion = extraerDescripcion(leida.limpia, leida.fecha?.fin ?? 0, leida.montos);

    const avisos: string[] = [];
    if (!leida.fecha) avisos.push('La fecha se heredó de la línea anterior.');
    if (!descripcion) avisos.push('No se pudo leer una descripción.');
    if (leida.montos.length > 2) {
      avisos.push(`La línea traía ${leida.montos.length} cifras; revisa el monto.`);
    }

    movimientos.push({
      date: fecha,
      amount: elegido.valor,
      type: elegido.negativo || !INGRESO.test(leida.linea) ? 'expense' : 'income',
      description: descripcion,
      lineaOriginal: leida.linea,
      avisos,
    });
  }

  return { movimientos, lineasIgnoradas, huboColumnaDeSaldo };
}

/**
 * ¿La última cifra de cada línea es el saldo corriente y no el monto?
 *
 * Es la trampa que más caro sale de todo el parser. Un extracto típico escribe
 * `01/08 EXITO POBLADO 45.900 1.234.567`, donde la última cifra es el saldo
 * después del movimiento. Quedarse con ella produce cifras absurdas que además
 * se ven plausibles.
 *
 * No se adivina por línea: se deduce del DOCUMENTO. Si la diferencia entre los
 * saldos de dos líneas seguidas equivale al monto de la segunda, entonces esa
 * columna es un saldo corriente. Una coincidencia así no ocurre por azar dos
 * veces seguidas.
 *
 * Se compara en CENTAVOS como enteros (BigInt), no en coma flotante: comparar
 * dinero con `number` es justamente lo que esta app tiene prohibido.
 */
export function laUltimaColumnaEsUnSaldo(porLinea: MontoLeido[][]): boolean {
  const conDos = porLinea.filter((montos) => montos.length >= 2);
  if (conDos.length < 3) return false;

  let coincidencias = 0;
  let comparaciones = 0;

  for (let i = 1; i < conDos.length; i += 1) {
    const anterior = conDos[i - 1]!;
    const actual = conDos[i]!;

    const saldoAnterior = aCentavos(anterior[anterior.length - 1]!.valor);
    const saldoActual = aCentavos(actual[actual.length - 1]!.valor);
    const monto = aCentavos(actual[actual.length - 2]!.valor);

    comparaciones += 1;
    const delta = saldoActual - saldoAnterior;
    if (delta === monto || delta === -monto) coincidencias += 1;
  }

  // Dos tercios de coincidencia.
  //
  // Cuánta tolerancia da eso, exactamente: una línea mal leída rompe DOS
  // comparaciones —la suya y la de la siguiente, que la usa como referencia—,
  // así que el umbral admite alrededor de una línea corrupta por cada seis.
  // Para un extracto mensual de treinta o cuarenta movimientos, es holgado;
  // para un fragmento de cinco líneas, no. Y así debe ser: con cinco líneas no
  // hay evidencia suficiente para descartar una columna entera.
  return comparaciones > 0 && coincidencias / comparaciones >= 2 / 3;
}

function aCentavos(valor: string): bigint {
  const [entero = '0', decimales = '00'] = valor.split('.');
  return BigInt(entero) * 100n + BigInt(decimales.padEnd(2, '0'));
}

function elegirMonto(montos: MontoLeido[], hayColumnaDeSaldo: boolean): MontoLeido {
  if (hayColumnaDeSaldo && montos.length >= 2) {
    return montos[montos.length - 2]!;
  }
  return montos[montos.length - 1]!;
}

/**
 * Lo que queda de la línea al quitarle la fecha y todas las cifras.
 *
 * Se quitan TODAS las cifras, no solo la elegida: el saldo corriente o un
 * número de cuota dentro de la descripción solo estorban.
 */
function extraerDescripcion(linea: string, finDeLaFecha: number, montos: MontoLeido[]): string {
  let resultado = linea.slice(finDeLaFecha);
  const desplazamiento = finDeLaFecha;

  // De atrás hacia adelante, para que los índices no se muevan al cortar.
  for (const monto of [...montos].reverse()) {
    const inicio = monto.inicio - desplazamiento;
    const fin = monto.fin - desplazamiento;
    if (inicio < 0) continue;
    resultado = resultado.slice(0, inicio) + ' ' + resultado.slice(fin);
  }

  return resultado
    .replace(/[|*;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}
