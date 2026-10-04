/**
 * Las firmas: por qué señales se reconoce a cada acreedor.
 *
 * ── Por qué una tabla y no condiciones repartidas por el código ─────────────
 * Porque esto crece con cada recibo nuevo que llega mal clasificado, y crece
 * por AÑADIDO: un alias más, un NIT más. Repartido en `if`s, cada añadido
 * obliga a leer el flujo entero para saber dónde ponerlo y qué otra cosa va a
 * romper. Siendo datos, se añade una línea y las pruebas dicen si algo se
 * movió de sitio.
 *
 * ── Por qué el NIT pesa más que el nombre ──────────────────────────────────
 * Porque un nombre comercial aparece en cualquier parte del recibo —en la
 * publicidad del reverso, en el nombre del banco que recauda— y el NIT solo
 * aparece donde identifica a alguien. Es el dato menos ambiguo de una factura
 * colombiana.
 */

export interface Firma {
  /** El concepto exacto, tal como existe en el árbol de categorías. */
  concepto: string;
  categoria: string;
  centro: string;
  /** Razones sociales y nombres comerciales tal como salen en el texto. */
  alias: string[];
  /** NIT sin puntos ni dígito de verificación. La señal más fuerte. */
  nits?: string[];
  /**
   * Trozos que aparecen en el NOMBRE del archivo o de la carpeta. Señal de
   * apoyo: quien nombra un archivo ya sabía de qué era.
   */
  tokensDeNombre?: string[];
  /**
   * Abreviaturas que solo valen ANCLADAS al principio del nombre. "AO" en
   * medio de una palabra no dice nada; "AO - agosto.pdf" sí.
   */
  prefijosDeNombre?: string[];
  /**
   * Palabras que DESCARTAN esta firma aunque el alias coincida. Es lo que
   * separa "Claro Hogar" de "Claro Movil" cuando el recibo dice las dos.
   */
  excluye?: string[];
  /**
   * Desempata cuando dos firmas coinciden. Más alto gana.
   *
   * Existe por un caso real: una planilla de la PILA menciona "ARL Sura" y
   * "EPS Sura", así que coincide con Sura y con Seguridad Social a la vez. Y
   * es Seguridad Social: lo que se pagó es la planilla, Sura solo es a dónde
   * fue una parte.
   */
  prioridad?: number;
  /** Rango típico en pesos. Un valor muy fuera baja la confianza. */
  rango?: { min: number; max: number };
}

/**
 * Los bancos y recaudadores: NO son el acreedor.
 *
 * Aparecen en casi todos los recibos porque son por donde pasó la plata. Un
 * clasificador que los tome por el destinatario acaba con la mitad del año en
 * "Bancolombia", que no es un gasto: es una tubería.
 */
export const RECAUDADORES = [
  'bancolombia',
  'bbva',
  'scotiabank',
  'davivienda',
  'banco de bogota',
  'banco de bogotá',
  'banco popular',
  'colpatria',
  'itau',
  'itaú',
  'av villas',
  'fiduciaria',
  'fiducia',
  'pse',
  'zona pagos',
  'zonapagos',
  'efecty',
  'baloto',
  'nequi',
  'daviplata',
];

/**
 * El catálogo inicial, sacado de los 443 soportes que ya están cargados.
 *
 * No se inventó: cada alias y cada exclusión está aquí porque un recibo real
 * lo necesitaba.
 */
export const FIRMAS: Firma[] = [
  // ── Servicios públicos ──────────────────────────────────────────────────
  {
    concepto: 'Aquaoccidente (Agua)',
    categoria: 'Servicios públicos',
    centro: 'Costos fijos',
    alias: ['aquaoccidente', 'acueducto', 'acuaoccidente'],
    prefijosDeNombre: ['ao'],
    tokensDeNombre: ['agua', 'aquaoccidente'],
    rango: { min: 15_000, max: 400_000 },
  },
  {
    concepto: 'Gases de Occidente (Gas)',
    categoria: 'Servicios públicos',
    centro: 'Costos fijos',
    alias: ['gases de occidente', 'gasoccidente', 'gases del occidente'],
    prefijosDeNombre: ['go', 'gdo'],
    tokensDeNombre: ['gas'],
    rango: { min: 5_000, max: 300_000 },
  },
  {
    concepto: 'Celsia (Energia)',
    categoria: 'Servicios públicos',
    centro: 'Costos fijos',
    // "celcia" con c: es como lo escribe el OCR cuando el logo está impreso
    // en un tipo estrecho.
    alias: ['celsia', 'celcia', 'epsa'],
    // El internet de Celsia es otro servicio y se factura aparte.
    excluye: ['internet', 'fibra'],
    tokensDeNombre: ['energia', 'energía', 'luz', 'celsia'],
    rango: { min: 20_000, max: 900_000 },
  },
  {
    concepto: 'Claro Hogar',
    categoria: 'Servicios públicos',
    centro: 'Costos fijos',
    alias: ['claro', 'comcel'],
    // Sin esto, los dos Claro coinciden con todo recibo de Claro.
    tokensDeNombre: ['hogar', 'multiplay'],
    prioridad: 2,
    rango: { min: 30_000, max: 500_000 },
  },
  {
    concepto: 'Claro Movil',
    categoria: 'Servicios públicos',
    centro: 'Costos fijos',
    alias: ['claro', 'comcel'],
    tokensDeNombre: ['movil', 'móvil', 'celular', 'personal', 'corporativo', 'tuti'],
    prioridad: 2,
    rango: { min: 20_000, max: 600_000 },
  },
  {
    concepto: 'Movistar',
    categoria: 'Servicios públicos',
    centro: 'Costos fijos',
    alias: ['movistar', 'telefonica', 'telefónica', 'colombia telecomunicaciones'],
    tokensDeNombre: ['movistar'],
    rango: { min: 10_000, max: 600_000 },
  },

  // ── Seguridad social ────────────────────────────────────────────────────
  {
    concepto: 'PILA / Seguridad Social',
    categoria: 'Seguridad social',
    centro: 'Costos fijos',
    alias: [
      'planilla',
      'aportes en linea',
      'aportes en línea',
      'pila',
      'colpensiones',
      'porvenir',
      'cotizante',
      'liquidacion de aportes',
      'liquidación de aportes',
    ],
    tokensDeNombre: ['pila', 'seguridad social'],
    // Más alta que Sura: una planilla menciona "ARL Sura" y "EPS Sura", y lo
    // que se pagó es la planilla.
    prioridad: 9,
    rango: { min: 100_000, max: 8_000_000 },
  },

  // ── Salud y vida ────────────────────────────────────────────────────────
  {
    concepto: 'Sura',
    categoria: 'Salud y vida',
    centro: 'Costos fijos',
    alias: ['sura', 'suramericana'],
    prioridad: 1,
    rango: { min: 50_000, max: 1_500_000 },
  },
  {
    concepto: 'AXA Medicina Prepagada',
    categoria: 'Salud y vida',
    centro: 'Costos fijos',
    alias: ['axa', 'colpatria medicina', 'medicina prepagada'],
    tokensDeNombre: ['medicina', 'prepagada', 'seguros de vida', 'hyc', 'h&c'],
    excluye: ['duster'],
    prioridad: 3,
    rango: { min: 100_000, max: 2_000_000 },
  },
  {
    concepto: 'Allianz (Seguro)',
    categoria: 'Salud y vida',
    centro: 'Costos fijos',
    alias: ['allianz'],
    rango: { min: 50_000, max: 3_000_000 },
  },
  {
    concepto: 'Seguros Bolivar',
    categoria: 'Salud y vida',
    centro: 'Costos fijos',
    alias: ['seguros bolivar', 'seguros bolívar', 'bolivar'],
    rango: { min: 50_000, max: 3_000_000 },
  },

  // ── Vehículos ───────────────────────────────────────────────────────────
  {
    concepto: 'AXA Seguro Duster',
    categoria: 'Vehículos',
    centro: 'Costos fijos',
    alias: ['axa'],
    tokensDeNombre: ['duster'],
    // Por encima de la medicina prepagada: el Duster lo nombra el archivo, y
    // el texto de los dos dice "AXA".
    prioridad: 4,
    rango: { min: 100_000, max: 4_000_000 },
  },
  {
    concepto: 'SOAT',
    categoria: 'Vehículos',
    centro: 'Costos fijos',
    alias: ['soat', 'seguro obligatorio'],
    tokensDeNombre: ['soat'],
    prioridad: 5,
    rango: { min: 200_000, max: 1_500_000 },
  },

  // ── Educación ───────────────────────────────────────────────────────────
  {
    concepto: 'Colegio Rafael Pombo',
    categoria: 'Educación',
    centro: 'Costos fijos',
    alias: ['rafael pombo', 'colegio rafael'],
    prefijosDeNombre: ['rp'],
    tokensDeNombre: ['pombo'],
    rango: { min: 100_000, max: 3_000_000 },
  },
  {
    concepto: 'Colegio Tuti',
    categoria: 'Educación',
    centro: 'Costos fijos',
    alias: ['colegio tuti'],
    tokensDeNombre: ['colegio tuti'],
    rango: { min: 100_000, max: 3_000_000 },
  },
];

/**
 * La prioridad de una firma escrita por una persona.
 *
 * Por encima de todas las del catálogo —la más alta es 9— y no por poco: lo
 * que alguien escribió en su concepto no es otro candidato más, es una
 * instrucción. «Si el recibo dice Comfandi, es este concepto» gana aunque el
 * catálogo reconozca a otro acreedor con más señales, porque el catálogo son
 * mis suposiciones y esto es su cuenta.
 */
export const PRIORIDAD_DE_LO_ESCRITO = 100;

/** Un concepto del árbol de alguien, con lo que se busca para reconocerlo. */
export interface ConceptoConPalabras {
  concepto: string;
  categoria: string;
  centro: string;
  /** Tal como se escribieron. Se normalizan al comparar. */
  palabras: readonly string[];
}

/**
 * Convierte los conceptos de alguien en firmas.
 *
 * ── Por qué la misma palabra va al texto Y al nombre del archivo ────────────
 * Porque es la misma palabra y los dos sitios fallan de forma distinta. En un
 * escaneo torcido el reconocimiento se come el nombre del acreedor, y ahí lo
 * único que queda es que el archivo se llame «comfandi agosto.pdf». Al revés
 * —un PDF digital con el nombre «documento (3).pdf»— la señal está en el
 * texto. Pedir dos listas para eso sería pedir que la misma palabra se
 * escriba dos veces.
 *
 * Un NIT escrito como palabra clave entra por `alias` y no por `nits`, y es a
 * propósito: `nits` compara sin puntos ni espacios, y lo que se escribe a mano
 * en un campo de texto puede ser cualquier cosa —un nombre, un número, media
 * frase—. Se busca tal cual, que es lo que quien lo escribió espera.
 *
 * Los conceptos sin palabras no producen firma: una firma sin señales no
 * coincide nunca y solo alarga el recorrido.
 */
export function firmasDeConceptos(conceptos: readonly ConceptoConPalabras[]): Firma[] {
  return conceptos
    .filter((concepto) => concepto.palabras.length > 0)
    .map((concepto) => ({
      concepto: concepto.concepto,
      categoria: concepto.categoria,
      centro: concepto.centro,
      alias: [...concepto.palabras],
      tokensDeNombre: [...concepto.palabras],
      prioridad: PRIORIDAD_DE_LO_ESCRITO,
    }));
}

/** Sin tildes, en minúscula y con los espacios normalizados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Los conceptos de un árbol, con lo que hace falta para reconocerlos.
 *
 * Es el recorrido que hacía el frontend para sacar firmas de las palabras
 * clave de la persona. Vive aquí porque la API necesita exactamente el mismo
 * —el cerebro pasa al servidor y tiene que leer el mismo árbol igual—, y dos
 * recorridos distintos es cómo una palabra clave vale en el navegador y no en
 * la API.
 *
 * Toma la forma mínima de un nodo para no depender del tipo de nadie: el árbol
 * del frontend y el que la API arma desde Prisma encajan los dos.
 */
export function conceptosConPalabrasDelArbol(
  raices: readonly {
    name: string;
    palabras_clave?: readonly string[];
    children?: readonly { name: string; palabras_clave?: readonly string[]; children?: readonly { name: string; palabras_clave?: readonly string[] }[] }[];
  }[],
): ConceptoConPalabras[] {
  return raices.flatMap((centro) =>
    (centro.children ?? []).flatMap((categoria) =>
      (categoria.children ?? []).map((concepto) => ({
        concepto: concepto.name,
        categoria: categoria.name,
        centro: centro.name,
        palabras: concepto.palabras_clave ?? [],
      })),
    ),
  );
}

/** Las firmas que salen de las palabras clave de un árbol. */
export function firmasDelArbol(
  raices: Parameters<typeof conceptosConPalabrasDelArbol>[0],
): Firma[] {
  return firmasDeConceptos(conceptosConPalabrasDelArbol(raices));
}
