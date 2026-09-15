/**
 * Detección de la estructura de un CSV.
 *
 * ── El problema real ────────────────────────────────────────────────────────
 * Los archivos que alguien ya tiene NO van a traer las cabeceras que a mí se me
 * ocurran. Traerán "Fecha", "FECHA MOVIMIENTO", "date", "Valor", "Monto",
 * "Débito"… Exigir un formato exacto significaría reescribir años de historial
 * a mano, que es justamente lo que importar un CSV venía a evitar.
 *
 * Así que se detecta y se muestra lo detectado para que la persona lo corrija
 * si hace falta. Adivinar en silencio sería peor que exigir.
 */

/** Qué papel cumple cada columna. */
export type Papel = 'fecha' | 'monto' | 'descripcion' | 'tipo' | 'categoria' | 'ignorar';

/**
 * Sinónimos por papel, ya normalizados (minúsculas, sin tildes).
 *
 * El orden importa: se prueba de la más específica a la más genérica, porque
 * una cabecera como "fecha de transacción" debe ganar a "fecha" y no al revés.
 */
const SINONIMOS: Record<Exclude<Papel, 'ignorar'>, readonly string[]> = {
  fecha: [
    'fecha de transaccion', 'fecha transaccion', 'fecha movimiento', 'fecha de movimiento',
    'fecha operacion', 'transaction date', 'fecha valor', 'fecha', 'date', 'dia', 'day',
  ],
  monto: [
    'valor total', 'monto total', 'importe', 'valor', 'monto', 'amount', 'total',
    'debito', 'credito', 'cargo', 'abono', 'precio', 'cantidad',
  ],
  descripcion: [
    'descripcion', 'concepto', 'detalle', 'comercio', 'establecimiento', 'referencia',
    'description', 'merchant', 'memo', 'nota', 'notas', 'observacion', 'observaciones',
  ],
  tipo: ['tipo', 'type', 'naturaleza', 'clase', 'ingreso egreso', 'movimiento'],
  categoria: ['categoria', 'category', 'rubro', 'clasificacion', 'grupo'],
};

/** Minúsculas, sin tildes, sin puntuación, espacios colapsados. */
export function normalizarCabecera(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ColumnaDetectada {
  indice: number;
  cabecera: string;
  papel: Papel;
}

/**
 * Asigna un papel a cada columna a partir de su cabecera.
 *
 * Cada papel se asigna UNA sola vez: si dos columnas parecen la fecha, se
 * queda con la que coincidió de forma más específica. Un CSV con "Fecha" y
 * "Fecha de corte" no puede acabar con dos columnas de fecha compitiendo.
 */
export function detectarColumnas(cabeceras: readonly string[]): ColumnaDetectada[] {
  const normalizadas = cabeceras.map(normalizarCabecera);
  const asignado = new Map<Papel, { indice: number; puntaje: number }>();

  normalizadas.forEach((cabecera, indice) => {
    const mejor = mejorPapelPara(cabecera);
    if (!mejor) return;

    const actual = asignado.get(mejor.papel);
    // Mayor puntaje = coincidencia más específica.
    if (!actual || mejor.puntaje > actual.puntaje) {
      asignado.set(mejor.papel, { indice, puntaje: mejor.puntaje });
    }
  });

  const papelPorIndice = new Map<number, Papel>();
  for (const [papel, { indice }] of asignado) papelPorIndice.set(indice, papel);

  return cabeceras.map((cabecera, indice) => ({
    indice,
    cabecera,
    papel: papelPorIndice.get(indice) ?? 'ignorar',
  }));
}

/**
 * El papel que mejor encaja con una cabecera, y cuánto.
 *
 * El puntaje es la longitud del sinónimo que coincidió: cuanto más largo, más
 * específico. "fecha de transaccion" (19) le gana a "fecha" (5) sobre la misma
 * cabecera, que es lo que se quiere.
 */
function mejorPapelPara(cabecera: string): { papel: Papel; puntaje: number } | null {
  if (!cabecera) return null;

  let mejor: { papel: Papel; puntaje: number } | null = null;

  for (const [papel, sinonimos] of Object.entries(SINONIMOS)) {
    for (const sinonimo of sinonimos) {
      // Coincidencia exacta o la cabecera contiene el sinónimo como palabra.
      const coincide =
        cabecera === sinonimo ||
        new RegExp(`(^| )${escapar(sinonimo)}( |$)`).test(cabecera);

      if (coincide && (!mejor || sinonimo.length > mejor.puntaje)) {
        mejor = { papel: papel as Papel, puntaje: sinonimo.length };
      }
    }
  }

  return mejor;
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Qué falta para poder importar.
 *
 * Solo fecha y monto son imprescindibles: sin ellos no hay movimiento. La
 * descripción se puede quedar vacía —el gasto sigue siendo real— y el tipo
 * tiene un valor razonable por defecto.
 */
export function faltantes(columnas: readonly ColumnaDetectada[]): Papel[] {
  const papeles = new Set(columnas.map((columna) => columna.papel));
  return (['fecha', 'monto'] as const).filter((papel) => !papeles.has(papel));
}

export function indiceDe(columnas: readonly ColumnaDetectada[], papel: Papel): number | null {
  return columnas.find((columna) => columna.papel === papel)?.indice ?? null;
}
