import { createHash } from 'node:crypto';

import { serializar, type Money } from '../../common/money/money';

/**
 * Huella de un movimiento, para detectar repeticiones entre importaciones.
 *
 * Lógica pura y sin dependencias para poder probarla exhaustivamente: si la
 * normalización falla, o bien se cuelan movimientos repetidos, o bien se
 * marcan como repetidos movimientos que no lo son. Las dos cosas erosionan la
 * confianza en las cifras, que es lo único que esta app vende.
 *
 * ── Lo que la huella NO hace ────────────────────────────────────────────────
 * No decide. Dos huellas iguales significan "esto se parece a algo que ya
 * tienes", no "esto sobra": dos cafés de $5.000 el mismo día en el mismo sitio
 * son dos movimientos reales. Por eso la columna `external_ref` no lleva
 * UNIQUE y la fila se marca `duplicate` para que la persona decida.
 */

/**
 * Ruido que los extractos meten en la descripción y que cambia entre lecturas
 * del MISMO movimiento. Si no se quitara, la huella nunca coincidiría y el
 * dedupe no serviría de nada.
 */
const RUIDO: RegExp[] = [
  // Referencias de transacción: "REF 000123456", "AUT 45219".
  /\b(?:ref|aut|apr|autoriz\w*|comprobante|cus|doc)[\s.:#-]*\d{3,}\b/g,
  // Fragmentos de tarjeta: "****1234", "XXXX 5678", "terminada en 1234".
  // Sin `\b` delante: entre un espacio y un `*` NO hay frontera de palabra
  // —ninguno de los dos es carácter de palabra— y el patrón nunca casaría.
  /(?:[*x]{2,}\s*\d{4}|\bterminada\s+en\s+\d{4}\b)/g,
  // Fechas y horas incrustadas.
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
  // Coletillas de banco que no distinguen un movimiento de otro.
  /\b(?:compra|pago|pse|debito|credito|transaccion|trans)\b/g,
];

/**
 * Normaliza una descripción para comparar.
 *
 * Minúsculas, sin tildes, sin ruido, sin puntuación y con los espacios
 * colapsados. `Éxito Poblado  REF 0012` y `EXITO POBLADO ref 9987` acaban
 * siendo la misma cadena, que es exactamente lo que se busca: el mismo
 * comercio leído dos veces.
 *
 * ── Sobre la ñ ─────────────────────────────────────────────────────────────
 * Se pliega a `n`, aunque en español sean letras distintas. La entrada de esta
 * función es texto de OCR, y la virgulilla es justo la clase de marca que un
 * OCR pierde: el mismo comercio saldría "Peñalisa" una vez y "Penalisa" otra,
 * y la huella dejaría de coincidir — que es el fallo que esta función existe
 * para evitar.
 *
 * El costo del pliegue es que dos comercios que solo se diferencien por la ñ
 * podrían marcarse como repetidos. Para que eso ocurra tendrían que coincidir
 * ADEMÁS en cuenta, fecha y monto al centavo, y aun entonces solo se marca:
 * la persona desmarca la casilla. El fallo contrario —duplicados que se cuelan
 * sin avisar— es mucho más caro de descubrir y de limpiar.
 */
export function normalizarDescripcion(texto: string | null | undefined): string {
  if (!texto) return '';

  let resultado = texto
    .toLowerCase()
    // NFD separa cada letra de su marca diacrítica; el rango ̀-ͯ son
    // esas marcas. Incluye la virgulilla de la ñ, que aquí se pliega a propósito.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  for (const patron of RUIDO) {
    resultado = resultado.replace(patron, ' ');
  }

  return resultado
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DatosDeHuella {
  accountId: bigint;
  /** Fecha de negocio. Solo cuenta el día: la hora no distingue movimientos. */
  date: Date;
  amount: Money;
  description?: string | null;
}

/**
 * SHA-256 hexadecimal de los cuatro datos que identifican un movimiento.
 *
 * Se incluye la cuenta porque el mismo cobro en dos tarjetas distintas son dos
 * movimientos. Se incluye el monto ya serializado a dos decimales para que
 * `1000` y `1000.00` produzcan la misma huella. Y no se incluye el tipo porque
 * lo determina el signo del monto en el propio extracto: añadirlo solo abriría
 * la puerta a que un parseo distinto rompiera la coincidencia.
 */
export function calcularHuella(datos: DatosDeHuella): string {
  const partes = [
    datos.accountId.toString(),
    aFechaISO(datos.date),
    serializar(datos.amount),
    normalizarDescripcion(datos.description),
  ];

  return createHash('sha256').update(partes.join('|')).digest('hex');
}

/**
 * Fecha en `YYYY-MM-DD`, leída en UTC.
 *
 * UTC y no la zona local a propósito: MariaDB devuelve las columnas DATE como
 * medianoche UTC, y usar `getMonth()` local desplazaría el día en Bogotá
 * (UTC-5) para toda fecha guardada — un movimiento del día 1 se leería como
 * del 31 anterior, y la huella dejaría de coincidir.
 */
export function aFechaISO(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
