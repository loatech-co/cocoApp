import { normalizar } from './firmas';

/**
 * Cuánto se pagó, sacado de un recibo.
 *
 * ── Por qué no vale coger el número más grande ──────────────────────────────
 * Porque un recibo está lleno de números grandes que no son plata: el número
 * de la factura, el código de autorización, el CUS de una transacción, el NIT,
 * un IBC que no se paga, una dirección IP. Coger el mayor acierta a veces y
 * falla justo en los recibos que más importan.
 *
 * ── Cómo se decide ──────────────────────────────────────────────────────────
 * Cada candidato empieza en cero y suma por lo que lo hace parecer dinero
 * —está en una línea que dice "total a pagar", trae separador de miles, trae
 * un peso delante— y resta por lo que lo delata como identificador. El mayor
 * puntaje gana, y solo a igualdad de puntaje se mira el tamaño.
 */

/** Las líneas donde de verdad está lo que se pagó, de más a menos fiable. */
const LINEAS_DE_TOTAL: { patron: RegExp; puntos: number }[] = [
  { patron: /valor\s+a\s+pagar/i, puntos: 10 },
  { patron: /total\s+a\s+pagar/i, puntos: 10 },
  { patron: /total\s+pagado/i, puntos: 10 },
  { patron: /valor\s+pagado/i, puntos: 10 },
  { patron: /neto\s+a\s+pagar/i, puntos: 9 },
  { patron: /pago\s+total/i, puntos: 8 },
  { patron: /total\s+factura/i, puntos: 8 },
  { patron: /\btotal\b/i, puntos: 6 },
  { patron: /\bvalor\b/i, puntos: 4 },
  { patron: /\bpagar\b/i, puntos: 4 },
];

/**
 * Lo que descarta un número por completo.
 *
 * `IBC` es el caso más caro: en una planilla de la PILA es la base de
 * cotización —varios millones— y no se paga. Está en la misma página que el
 * valor a pagar y suele ser mayor.
 */
const DELATORES: { patron: RegExp; puntos: number }[] = [
  { patron: /\bibc\b/i, puntos: -20 },
  { patron: /ingreso\s+base/i, puntos: -20 },
  { patron: /\bnit\b/i, puntos: -15 },
  { patron: /\bcus\b/i, puntos: -15 },
  { patron: /autorizaci[oó]n/i, puntos: -15 },
  { patron: /n[uú]mero\s+de\s+(factura|recibo|referencia|operaci[oó]n)/i, puntos: -15 },
  {
    patron: /\b(factura|recibo|referencia|radicado|planilla)\s*(no|n°|nro|#)?\s*:?\s*$/i,
    puntos: -8,
  },
  { patron: /c[oó]digo/i, puntos: -10 },
  { patron: /cuenta|contrato|suscriptor|medidor|poliza|póliza/i, puntos: -8 },
  { patron: /tel[eé]fono|celular|whatsapp/i, puntos: -10 },
  { patron: /lectura\s+(actual|anterior)/i, puntos: -8 },
  { patron: /consumo|m3|kwh/i, puntos: -6 },
];

/** Un número tal como puede aparecer escrito: con miles, decimales o peso. */
const CANDIDATO =
  /\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\$\s?\d+(?:[.,]\d{1,2})?|\b\d{4,9}\b/g;

/**
 * Una IPv4 de verdad: los cuatro grupos de 0 a 255.
 *
 * Con un patrón laxo —`\d{1,3}(\.\d{1,3}){3}`— un monto como `3.321.802` no es
 * una IP, pero `1.234.567.890` sí lo parecería, y al revés: `192.168.1.1` se
 * colaría como monto. Estricto es la diferencia entre descartar una IP y
 * comerse tres millones de pesos.
 */
const IPV4 =
  /\b(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/;

export interface MontoCandidato {
  valor: number;
  puntaje: number;
  linea: string;
  /** Si salió de una línea que nombra un total. Sube la confianza. */
  deLineaDeTotal: boolean;
}

/**
 * Convierte lo escrito en un número.
 *
 * La regla del separador es la misma que usa el importador de extractos: si
 * hay uno solo seguido de exactamente tres cifras, es de miles. `45.900` son
 * cuarenta y cinco mil novecientos pesos, y confundirlo con 45,90 deja el año
 * mil veces mal con una cifra que se ve plausible.
 */
export function aNumero(texto: string): number | null {
  const limpio = texto.replace(/[$\s]/g, '');
  if (!/^\d[\d.,]*$/.test(limpio)) return null;

  const puntos = (limpio.match(/\./g) ?? []).length;
  const comas = (limpio.match(/,/g) ?? []).length;
  let entero = limpio;
  let decimales = '';

  if (puntos > 0 && comas > 0) {
    const decimal = limpio.lastIndexOf('.') > limpio.lastIndexOf(',') ? '.' : ',';
    const corte = limpio.lastIndexOf(decimal);
    entero = limpio.slice(0, corte);
    decimales = limpio.slice(corte + 1);
  } else if (puntos === 1 || comas === 1) {
    const separador = puntos === 1 ? '.' : ',';
    // Hay exactamente un separador, así que siempre salen dos partes.
    const [izquierda = '', derecha = ''] = limpio.split(separador);
    if (derecha.length === 3) entero = izquierda + derecha;
    else {
      entero = izquierda;
      decimales = derecha;
    }
  }

  const numero = Number(`${entero.replace(/[.,]/g, '')}.${decimales || '0'}`);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * El valor del recibo.
 *
 * `esPlanilla` cambia el criterio: en una planilla de la PILA el número mayor
 * es el IBC y el que se paga está en el resumen. Sin esa distinción, todas las
 * planillas salen con la base de cotización en vez de con el aporte.
 */
export function leerMonto(
  texto: string,
  opciones: { esPlanilla?: boolean; rango?: { min: number; max: number } | undefined } = {},
): MontoCandidato | null {
  const candidatos: MontoCandidato[] = [];

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (linea === '') continue;

    // Si la línea ES una IP, no hay nada que sacar de ella.
    const sinIp = linea.replace(IPV4, ' ');
    const normal = normalizar(linea);

    let contexto = 0;
    let deTotal = false;
    for (const { patron, puntos } of LINEAS_DE_TOTAL) {
      if (patron.test(linea)) {
        contexto = Math.max(contexto, puntos);
        deTotal = true;
        break;
      }
    }
    for (const { patron, puntos } of DELATORES) {
      if (patron.test(linea)) contexto += puntos;
    }

    // En una planilla, el IBC pesa tanto que conviene decirlo aparte.
    if (opciones.esPlanilla && /\bibc\b|ingreso\s+base/i.test(linea)) continue;

    for (const bruto of sinIp.match(CANDIDATO) ?? []) {
      const valor = aNumero(bruto);
      if (valor === null || valor <= 0) continue;

      let puntaje = contexto;

      // Formato de dinero: separador de miles o peso delante. Un número
      // pelado de seis cifras puede ser un monto o un número de factura; uno
      // escrito `1.526.000` ya eligió ser dinero.
      if (/[.,]\d{3}/.test(bruto)) puntaje += 5;
      if (/\$/.test(bruto)) puntaje += 4;
      // Nadie paga 43 pesos, y un recibo de casa no llega a mil millones.
      if (valor < 1000) puntaje -= 6;
      if (valor > 50_000_000) puntaje -= 10;
      // Un año suelto no es plata.
      if (/^\d{4}$/.test(bruto) && valor >= 1900 && valor <= 2100) puntaje -= 12;
      // Una hora tampoco.
      if (/\d{1,2}:\d{2}/.test(linea) && valor < 10_000) puntaje -= 4;
      // Y si cae en el rango que este acreedor suele cobrar, es buena señal.
      if (opciones.rango && valor >= opciones.rango.min && valor <= opciones.rango.max) {
        puntaje += 3;
      }

      candidatos.push({ valor, puntaje, linea: normal.slice(0, 80), deLineaDeTotal: deTotal });
    }
  }

  if (candidatos.length === 0) return null;

  // Puntaje primero; el tamaño solo desempata. Al revés, un número de factura
  // de nueve cifras le gana a un total de seis.
  candidatos.sort((a, b) => b.puntaje - a.puntaje || b.valor - a.valor);
  return candidatos[0] ?? null;
}
