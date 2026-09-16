import {
  detectarColumnas,
  faltantes,
  indiceDe,
  type ColumnaDetectada,
} from './csv-columnas';
import type { MovimientoCandidato } from './extracto';
import { encontrarFecha } from '@/lib/leer-fecha';
import { normalizarMonto } from './monto';

/**
 * Lectura de un CSV de movimientos.
 *
 * ── Por qué el CSV es la vía buena para años de historial ───────────────────
 * No hay reconocimiento de texto de por medio. Lo que dice el archivo es lo que
 * entra: cero errores de OCR, cero columnas mal deducidas, cero fechas
 * inventadas. Para migrar de golpe un histórico grande es la única vía en la
 * que el resultado no depende de la nitidez de una captura.
 */

/**
 * Separador de campos.
 *
 * ── La trampa que hay que resolver bien ─────────────────────────────────────
 * En Colombia la coma es el separador DECIMAL, así que Excel en español exporta
 * los CSV con punto y coma. Un archivo `01/08/2026;Exito;45.900,50` leído con
 * coma produciría cuatro columnas absurdas y montos rotos.
 *
 * No se pregunta ni se asume: se deduce contando en las primeras líneas, que es
 * dato objetivo del propio archivo.
 */
const CANDIDATOS: readonly string[] = [';', ',', '\t', '|'];

export function detectarDelimitador(texto: string): string {
  const lineas = texto
    .split(/\r?\n/)
    .filter((linea) => linea.trim())
    .slice(0, 10);
  if (lineas.length === 0) return ',';

  let mejor = ',';
  let mejorPuntaje = -1;

  for (const candidato of CANDIDATOS) {
    const cuentas = lineas.map((linea) => contarFueraDeComillas(linea, candidato));
    const primera = cuentas[0] ?? 0;
    if (primera === 0) continue;

    // Un delimitador de verdad produce el MISMO número de columnas en todas las
    // líneas. Uno que aparece por casualidad dentro del texto, no. Por eso la
    // consistencia pesa cien veces más que el número de columnas.
    const consistentes = cuentas.filter((cuenta) => cuenta === primera).length;
    const puntaje = consistentes * 100 + primera;

    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = candidato;
    }
  }

  return mejor;
}

/** Cuenta apariciones ignorando lo que está entre comillas. */
function contarFueraDeComillas(linea: string, delimitador: string): number {
  let dentro = false;
  let total = 0;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];
    if (caracter === '"') {
      // Dos comillas seguidas son una comilla escapada, no un cambio de estado.
      if (dentro && linea[i + 1] === '"') i += 1;
      else dentro = !dentro;
    } else if (caracter === delimitador && !dentro) {
      total += 1;
    }
  }

  return total;
}

/**
 * Parte una línea en campos, respetando comillas.
 *
 * Se implementa a mano en vez de partir por el delimitador porque una
 * descripción entrecomillada puede contener el propio delimitador:
 * `"Exito Poblado, sede 80";45900` son DOS campos, no tres.
 */
export function partirLinea(linea: string, delimitador: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let dentro = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];

    if (caracter === '"') {
      if (dentro && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else {
        dentro = !dentro;
      }
    } else if (caracter === delimitador && !dentro) {
      campos.push(actual.trim());
      actual = '';
    } else {
      actual += caracter;
    }
  }

  campos.push(actual.trim());
  return campos;
}

export interface ResultadoDeCsv {
  movimientos: MovimientoCandidato[];
  columnas: ColumnaDetectada[];
  delimitador: string;
  /** Papeles imprescindibles que no se encontraron. Si no está vacío, no se importa. */
  faltan: string[];
  /** Filas con datos que no se pudieron interpretar, para que no desaparezcan. */
  filasIgnoradas: string[];
  /** Si se dedujo que el archivo marca los gastos con signo negativo. */
  usaSignos: boolean;
}

export function parsearCsv(
  texto: string,
  opciones: { anioPorDefecto?: number; mapeoManual?: ColumnaDetectada[] } = {},
): ResultadoDeCsv {
  const anio = opciones.anioPorDefecto ?? new Date().getFullYear();
  const delimitador = detectarDelimitador(texto);

  const lineas = texto
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean);

  const vacio: ResultadoDeCsv = {
    movimientos: [],
    columnas: [],
    delimitador,
    faltan: ['fecha', 'monto'],
    filasIgnoradas: [],
    usaSignos: false,
  };

  if (lineas.length === 0) return vacio;

  const cabeceras = partirLinea(lineas[0]!, delimitador);
  const columnas = opciones.mapeoManual ?? detectarColumnas(cabeceras);
  const faltan = faltantes(columnas);

  if (faltan.length > 0) {
    return { ...vacio, columnas, faltan, usaSignos: false };
  }

  const iFecha = indiceDe(columnas, 'fecha')!;
  const iMonto = indiceDe(columnas, 'monto')!;
  const iDescripcion = indiceDe(columnas, 'descripcion');
  const iTipo = indiceDe(columnas, 'tipo');

  const filas = lineas.slice(1).map((linea) => ({ linea, campos: partirLinea(linea, delimitador) }));

  /**
   * ¿El archivo usa el signo para distinguir gastos de ingresos?
   *
   * Se deduce del DOCUMENTO, no de cada fila: si en alguna parte hay montos
   * negativos, entonces el signo significa algo y un positivo es un ingreso.
   * Si TODO viene en positivo, no hay convención de signos y lo razonable es
   * que sean gastos — que es lo que predomina en un histórico de recibos.
   *
   * Sin esta deducción habría que elegir entre dos errores: marcar como
   * ingreso todo archivo sin negativos, o marcar como gasto los ingresos de un
   * archivo que sí los distingue. Cualquiera de los dos son cientos de filas
   * que corregir a mano.
   */
  const usaSignos = filas.some(({ campos }) => (campos[iMonto] ?? '').includes('-'));

  const movimientos: MovimientoCandidato[] = [];
  const filasIgnoradas: string[] = [];

  for (const { linea, campos } of filas) {
    const bruto = campos[iMonto] ?? '';
    const fecha = encontrarFecha(campos[iFecha] ?? '', anio);
    const monto = normalizarMonto(bruto);

    // Sin fecha o sin monto no hay movimiento. La fila se guarda para que se
    // vea que se descartó, en vez de desaparecer en silencio.
    if (!fecha || !monto) {
      filasIgnoradas.push(linea);
      continue;
    }

    const descripcion = (iDescripcion !== null ? campos[iDescripcion] : '') ?? '';

    movimientos.push({
      date: fecha.iso,
      amount: monto,
      type: deducirTipo({
        columnaTipo: iTipo !== null ? campos[iTipo] : undefined,
        negativo: bruto.includes('-'),
        usaSignos,
      }),
      description: descripcion.slice(0, 255),
      lineaOriginal: linea,
      avisos: avisosDe(monto, descripcion),
    });
  }

  return { movimientos, columnas, delimitador, faltan: [], filasIgnoradas, usaSignos };
}

/**
 * Gasto o ingreso, en orden de confianza.
 *
 * 1. Una columna de tipo que lo diga con palabras. Es lo más explícito que
 *    puede haber, y manda sobre cualquier deducción.
 * 2. El signo, PERO solo si el archivo demostró usarlos. En un archivo donde
 *    todo es positivo, un positivo no significa "ingreso": significa que ahí
 *    no se anotan signos.
 * 3. Gasto, que es lo que predomina en un histórico de recibos.
 */
function deducirTipo(datos: {
  columnaTipo: string | undefined;
  negativo: boolean;
  usaSignos: boolean;
}): 'expense' | 'income' {
  const texto = (datos.columnaTipo ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (/\b(ingreso|income|abono|entrada|credito|deposito|salario|nomina)\b/.test(texto)) {
    return 'income';
  }
  if (/\b(gasto|egreso|expense|salida|debito|cargo|compra|pago)\b/.test(texto)) {
    return 'expense';
  }

  if (datos.usaSignos) {
    return datos.negativo ? 'expense' : 'income';
  }

  return 'expense';
}

function avisosDe(monto: string, descripcion: string): string[] {
  const avisos: string[] = [];
  if (!descripcion.trim()) avisos.push('Sin descripción.');
  if (monto === '0.00') avisos.push('El monto es cero.');
  return avisos;
}
