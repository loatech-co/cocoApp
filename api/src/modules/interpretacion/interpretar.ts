import {
  FIRMAS,
  clasificar,
  firmasDelArbol,
  indexarArbol,
  rutaLegible,
  type EntradaDelIndice,
  type NodoBuscable,
} from '@coco/lectura';

/**
 * El cerebro: de un texto o de unos datos, a un gasto interpretado.
 *
 * ── Por qué está en la API y no solo en el navegador ────────────────────────
 * La interpretación vivía en `@coco/lectura` y corría solo en el navegador. La
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
export type Certeza = 'alta' | 'media' | 'ninguna';
export type Fuente = 'historial' | 'palabras-clave' | 'firma' | 'diccionario';

export interface EntradaParaInterpretar {
  /** Texto libre: el OCR de un recibo, el SMS del banco. */
  texto?: string | null;
  /** O datos ya estructurados, como los entrega el disparador de Wallet. */
  comercio?: string | null;
  monto?: string | number | null;
  /** `YYYY-MM-DD`. */
  fecha?: string | null;
  nombreDeArchivo?: string | null;
  /** El mes al que pertenece, `YYYY-MM`. Ayuda a elegir la fecha. */
  periodo?: string | null;
}

export interface Contexto {
  /** El árbol de la persona, con ids como cadenas. */
  arbol: readonly NodoBuscable[];
  /** Lo que el historial sugiere para este texto, si algo. */
  historial: { categoryId: string; confidence: number } | null;
  /** Hoy, `YYYY-MM-DD`, para no aceptar fechas futuras de un OCR torcido. */
  hoy: string;
}

export interface ClasificacionInterpretada {
  certeza: Certeza;
  fuente: Fuente | null;
  conceptoId: string | null;
  categoriaId: string | null;
  nombre: string | null;
  candidatos: { id: string; nombre: string; ruta: string }[];
  motivo: string;
}

export interface Interpretado {
  monto: string | null;
  fecha: string | null;
  comercio: string | null;
  descripcion: string | null;
  clasificacion: ClasificacionInterpretada;
  porRevisar: boolean;
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
export const HISTORIAL_SEGURO = 80;

export function interpretar(entrada: EntradaParaInterpretar, contexto: Contexto): Interpretado {
  const indice = indexarArbol(contexto.arbol);
  const textoLibre = (entrada.texto ?? '').trim();
  const comercio = (entrada.comercio ?? '').trim();

  // Lo que se le da a leer: el texto si lo hay; si no, el comercio solo. Un
  // comercio es un texto muy corto, y el lector sabe sacar de ahí el acreedor
  // aunque no haya monto ni fecha que leer.
  const lectura = clasificar({
    texto: textoLibre || comercio,
    fuente: 'texto-embebido',
    nombreDeArchivo: entrada.nombreDeArchivo ?? undefined,
    periodo: entrada.periodo ?? undefined,
    firmas: [...firmasDelArbol(contexto.arbol), ...FIRMAS],
    arbol: contexto.arbol,
  });

  // Lo estructurado manda sobre lo leído: si quien captura ya sabe el monto,
  // no hay nada que adivinar en el texto.
  const monto = montoDe(entrada.monto) ?? (lectura.valor === null ? null : String(lectura.valor));
  const fecha =
    fechaValida(entrada.fecha, contexto.hoy) ?? fechaValida(lectura.fecha, contexto.hoy);

  const clasificacion = clasificarCon(contexto, indice, lectura.enElArbol ?? null, {
    concepto: lectura.concepto,
    categoria: lectura.categoria,
    motivo: lectura.motivo,
  });

  return {
    monto,
    fecha,
    comercio: comercio || lectura.concepto || null,
    // La descripción es lo que se lee de un vistazo en la tabla: el comercio
    // si se sabe; si no, el concepto reconocido; si no, nada.
    descripcion: comercio || lectura.concepto || null,
    clasificacion,
    // Falta algo que alguien tiene que poner —el monto, la fecha— o la
    // clasificación no es segura: a revisar.
    porRevisar: clasificacion.certeza !== 'alta' || monto === null || fecha === null,
  };
}

function clasificarCon(
  contexto: Contexto,
  indice: readonly EntradaDelIndice[],
  enElArbol: NonNullable<ReturnType<typeof clasificar>['enElArbol']> | null,
  leido: { concepto: string | null; categoria: string | null; motivo: string },
): ClasificacionInterpretada {
  // 1. El historial, si tiene algo que decir.
  if (contexto.historial) {
    const entrada = indice.find((e) => String(e.id) === contexto.historial!.categoryId);
    if (entrada && entrada.nivel !== 'centro') {
      const alta = contexto.historial.confidence >= HISTORIAL_SEGURO;
      return {
        certeza: alta ? 'alta' : 'media',
        fuente: 'historial',
        conceptoId: entrada.nivel === 'concepto' ? String(entrada.id) : null,
        categoriaId:
          entrada.nivel === 'concepto' ? String(entrada.categoriaId) : String(entrada.id),
        nombre: entrada.nombre,
        candidatos: alta
          ? []
          : [{ id: String(entrada.id), nombre: entrada.nombre, ruta: rutaLegible(entrada) }],
        motivo: alta
          ? `Tu historial lo clasifica así (${contexto.historial.confidence}% de las veces).`
          : `Tu historial apunta aquí, pero no siempre (${contexto.historial.confidence}%): mejor míralo.`,
      };
    }
  }

  // 2 y 3. Lo que la lectura reconoció, por palabras clave, firma o diccionario.
  if (enElArbol) {
    const concepto =
      enElArbol.conceptoId !== undefined
        ? indice.find((e) => String(e.id) === String(enElArbol.conceptoId))
        : undefined;
    const categoria =
      enElArbol.categoriaId !== undefined
        ? indice.find((e) => String(e.id) === String(enElArbol.categoriaId))
        : undefined;
    return {
      certeza: enElArbol.certeza,
      fuente: enElArbol.fuente,
      conceptoId: concepto ? String(concepto.id) : null,
      categoriaId: categoria
        ? String(categoria.id)
        : concepto
          ? String(concepto.categoriaId)
          : null,
      nombre: concepto?.nombre ?? categoria?.nombre ?? leido.concepto ?? leido.categoria,
      candidatos: enElArbol.candidatos.map((c) => ({
        id: String(c.id),
        nombre: c.nombre,
        ruta: c.ruta,
      })),
      motivo: leido.motivo,
    };
  }

  return {
    certeza: 'ninguna',
    fuente: null,
    conceptoId: null,
    categoriaId: null,
    nombre: null,
    candidatos: [],
    motivo: leido.motivo,
  };
}

/** Un monto estructurado, como cadena decimal, o `null` si no sirve. */
function montoDe(monto: string | number | null | undefined): string | null {
  if (monto === null || monto === undefined || monto === '') return null;
  const n = typeof monto === 'number' ? monto : Number(String(monto).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/** `YYYY-MM-DD`, real y no futura. Lo demás es `null`. */
function fechaValida(fecha: string | null | undefined, hoy: string): string | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  if (Number.isNaN(Date.parse(fecha))) return null;
  if (fecha > hoy) return null;
  return fecha;
}

/**
 * Para una notificación: «Registrado: $45.000 · Alimentación», o «Pendiente
 * de clasificar». Tres palabras, que es como se lee una notificación.
 */
export function resumenDe(monto: string | null, clasificacion: ClasificacionInterpretada): string {
  const plata = monto === null ? null : pesos(monto);
  if (clasificacion.certeza === 'alta' && clasificacion.nombre) {
    return `Registrado: ${plata ?? 'sin valor'} · ${clasificacion.nombre}`;
  }
  if (clasificacion.certeza === 'media' && clasificacion.nombre) {
    return `Registrado: ${plata ?? 'sin valor'} · ${clasificacion.nombre} (por revisar)`;
  }
  return plata ? `Registrado: ${plata} · Pendiente de clasificar` : 'Pendiente de clasificar';
}

/** `45000` → `$45.000`. Sin decimales: así se escribe la plata aquí. */
export function pesos(monto: string | number): string {
  const n = Math.round(Number(monto));
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.abs(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}
