import { normalize } from './signatures';

/**
 * El diccionario del sistema: comercios colombianos → términos genéricos.
 *
 * ── Por qué apunta a TÉRMINOS y no a categorías ─────────────────────────────
 * Porque las categorías son de cada cuenta. «D1» no es «Mercado»: es un
 * comercio donde se compra mercado, y en el árbol de alguien eso puede
 * llamarse «Mercado», «Supermercado» o «Víveres», o estar bajo «Alimentación»
 * sin concepto. El diccionario traduce el comercio a palabras, y las palabras
 * se buscan en el árbol de esa persona con el mismo buscador de la ficha. Lo
 * que sale de ahí —un concepto, una categoría, nada— es de ella.
 *
 * ── Por qué está en el código y no en una tabla ─────────────────────────────
 * Igual que `FIRMAS` y `RECAUDADORES`: es conocimiento del sistema, no datos
 * de nadie. Versionado, se revisa como se revisa el código, y la fase 3 se lo
 * lleva a la API sin tocar el esquema.
 *
 * ── Es la ÚLTIMA fuente ─────────────────────────────────────────────────────
 * Por debajo del historial de la persona y de sus palabras clave. Solo habla
 * cuando nadie más tiene nada que decir, y aun así lo que diga pasa por la
 * ficha antes de guardarse. Una entrada equivocada aquí propone mal; no
 * clasifica mal.
 *
 * ── Qué va en `comercios` ───────────────────────────────────────────────────
 * Lo que de verdad sale en un recibo o en un SMS del banco: el nombre
 * comercial Y la razón social, que es lo que imprime el datáfono. «KOBA
 * COLOMBIA» es D1 y «JERONIMO MARTINS» es Ara, y sin eso el diccionario no
 * reconocería a los dos supermercados más frecuentes del país.
 */
export interface DictionaryGroup {
  /** Para leerlo en un informe. No se enseña. */
  group: string;
  /** Lo que se busca en el árbol de la persona, por nombre y palabra clave. */
  terms: readonly string[];
  /** Tal como aparecen en el texto. Se normalizan al comparar. */
  merchants: readonly string[];
}

export const DICTIONARY: readonly DictionaryGroup[] = [
  {
    group: 'mercado',
    terms: ['mercado', 'supermercado', 'viveres', 'alimentacion', 'despensa', 'tienda'],
    merchants: [
      'd1',
      'koba colombia',
      'koba',
      'ara',
      'jeronimo martins',
      'exito',
      'almacenes exito',
      'carulla',
      'olimpica',
      'supertiendas y droguerias olimpica',
      'jumbo',
      'cencosud',
      'alkosto',
      'makro',
      'pricesmart',
      'colsubsidio',
      'euro supermercado',
      'supermercados euro',
      'surtimax',
      'super inter',
      'zapatoca',
      'merqueo',
      'mercamio',
    ],
  },
  {
    group: 'restaurantes y domicilios',
    terms: [
      'restaurante',
      'restaurantes',
      'comida',
      'comidas',
      'domicilio',
      'domicilios',
      'almuerzo',
      'cena',
      'cafeteria',
    ],
    merchants: [
      'rappi',
      'didi food',
      'mcdonalds',
      'mcdonald',
      'mc donald',
      'arcos dorados',
      'frisby',
      'kokoriko',
      'el corral',
      'hamburguesas el corral',
      'crepes & waffles',
      'crepes y waffles',
      'crepes and waffles',
      'juan valdez',
      'starbucks',
      'subway',
      'kfc',
      'burger king',
      'dominos',
      "domino's",
      'papa johns',
      "papa john's",
      'sandwich qbano',
      'qbano',
      'presto',
      'tostao',
      'oma',
      'buffalo wings',
      'wok',
      'archies',
      "archie's",
    ],
  },
  {
    group: 'transporte',
    terms: ['transporte', 'taxi', 'pasajes', 'movilidad', 'parqueadero', 'parqueaderos'],
    merchants: [
      'uber',
      'cabify',
      'indrive',
      'indriver',
      'didi',
      'transmilenio',
      'tullave',
      'tu llave',
      'city parking',
      'parking international',
      'parqueadero',
      'parqueaderos',
    ],
  },
  {
    group: 'combustible',
    terms: ['gasolina', 'combustible', 'tanqueada', 'acpm', 'gas vehicular'],
    merchants: [
      'terpel',
      'primax',
      'texaco',
      'mobil',
      'esso',
      'biomax',
      'zeuss',
      'puma energy',
      'brio',
      'estacion de servicio',
      'eds',
    ],
  },
  {
    group: 'peajes',
    terms: ['peaje', 'peajes', 'vias', 'autopista'],
    merchants: ['peaje', 'peajes', 'flypass', 'facilpass', 'concesion vial', 'concesionaria'],
  },
  {
    group: 'farmacia',
    terms: ['farmacia', 'drogueria', 'medicamentos', 'medicinas', 'drogas'],
    merchants: [
      'farmatodo',
      'cruz verde',
      'la rebaja',
      'drogas la rebaja',
      'copservir',
      'locatel',
      'drogueria alemana',
      'droguerias alemana',
      'pasteur',
      'drogueria pasteur',
      'drogueria',
      'droguerias',
      'farmacia',
    ],
  },
  {
    group: 'servicios publicos',
    terms: [
      'servicios publicos',
      'agua',
      'luz',
      'energia',
      'gas',
      'acueducto',
      'aseo',
      'alcantarillado',
    ],
    merchants: [
      'epm',
      'empresas publicas de medellin',
      'emcali',
      'eaab',
      'acueducto de bogota',
      'acueducto',
      'enel',
      'codensa',
      'air-e',
      'afinia',
      'vanti',
      'triple a',
      'acuavalle',
      'veolia',
      'promoambiental',
      'celsia',
      'gases de occidente',
      'aquaoccidente',
      'essa',
      'chec',
      'electrohuila',
    ],
  },
  {
    group: 'telecomunicaciones',
    terms: ['internet', 'celular', 'telefonia', 'plan', 'datos', 'television', 'cable'],
    merchants: [
      'claro hogar',
      'claro movil',
      'claro',
      'comcel',
      'movistar',
      'telefonica',
      'tigo',
      'colombia movil',
      'etb',
      'wom',
      'directv',
      'virgin mobile',
    ],
  },
  {
    group: 'suscripciones digitales',
    terms: [
      'suscripcion',
      'suscripciones',
      'streaming',
      'licencias',
      'licencia',
      'apps',
      'software',
    ],
    merchants: [
      'netflix',
      'spotify',
      'disney plus',
      'disney+',
      'disneyplus',
      'hbo max',
      'hbomax',
      'hbo',
      'prime video',
      'amazon prime',
      'youtube premium',
      'youtube',
      'apple.com/bill',
      'apple.com bill',
      'itunes',
      'icloud',
      'google one',
      'google play',
      'microsoft 365',
      'office 365',
      'adobe',
      'dropbox',
      'canva',
      'openai',
      'chatgpt',
      'anthropic',
      'claude.ai',
      'notion',
      'paramount',
      'paramount+',
      'crunchyroll',
      'deezer',
    ],
  },
  {
    group: 'salud',
    terms: [
      'salud',
      'medico',
      'consulta',
      'examen',
      'examenes',
      'laboratorio',
      'eps',
      'prepagada',
      'odontologia',
      'clinica',
    ],
    merchants: [
      'sura',
      'eps sura',
      'sanitas',
      'colsanitas',
      'eps sanitas',
      'compensar',
      'nueva eps',
      'salud total',
      'famisanar',
      'coomeva',
      'axa colpatria',
      'colpatria medicina',
      'colmedica',
      'medplus',
      'colcan',
      'synlab',
      'dinamica ips',
      'clinica',
      'laboratorio clinico',
      'ips',
    ],
  },
  {
    group: 'educacion',
    terms: [
      'educacion',
      'colegio',
      'universidad',
      'matricula',
      'pension escolar',
      'curso',
      'cursos',
      'utiles',
    ],
    merchants: [
      'colegio',
      'universidad',
      'matricula',
      'pension escolar',
      'platzi',
      'coursera',
      'udemy',
      'duolingo',
      'panamericana libreria',
      'libreria panamericana',
      'libreria nacional',
      'libreria',
    ],
  },
];

/**
 * Las tuberías: por donde pasó la plata, no adónde fue.
 *
 * `RECAUDADORES` ya cubre a los bancos para la lectura de recibos. Esto añade
 * a las pasarelas de pago que aparecen en los SMS de compra —«Compra en
 * MERCADO PAGO*D1»— y que, dejadas en el texto, confundirían: «mercado pago»
 * no es mercado. Se quitan del texto ANTES de buscar comercios, y así el «d1»
 * que viene detrás sí se encuentra.
 *
 * No se tocan los `RECAUDADORES`: esa lista decide qué NO es el acreedor de un
 * recibo, y cambiarla es cosa de la lectura de soportes, no de esta fase.
 */
export const PIPELINES: readonly string[] = [
  'mercado pago',
  'mercadopago',
  'payu',
  'wompi',
  'bold',
  'addi',
  'epayco',
  'payvalida',
];

export interface FoundMerchant {
  group: DictionaryGroup;
  /** El alias que apareció, tal como está en el diccionario. */
  alias: string;
}

const ESCAPE = /[.*+?^${}()|[\]\\/]/g;

/**
 * Qué comercios del diccionario aparecen en un texto, del más seguro al menos.
 *
 * ── Dos reglas que importan más que la lista ────────────────────────────────
 * 1. Solo cuenta entre LÍMITES DE PALABRA. «ara» aparece dentro de «para»,
 *    «compara» y «barato»; sin esto, todo lo que dijera «para» sería mercado.
 *    Vale para todos los alias, no solo los cortos: «presto» está dentro de
 *    «prestamo».
 * 2. Gana el alias MÁS LARGO, y lo que ocupa se consume: «didi food» es
 *    domicilios y «didi» a secas es transporte; encontrado el primero, el
 *    segundo ya no puede aparecer dentro de él. Lo mismo con «claro hogar» y
 *    «claro».
 */
export function merchantsIn(text: string): FoundMerchant[] {
  let remaining = ` ${normalize(text)} `;
  for (const pipeline of PIPELINES) remaining = remaining.split(pipeline).join(' ');

  const candidates: { group: DictionaryGroup; alias: string; length: number }[] = [];
  for (const group of DICTIONARY) {
    for (const alias of group.merchants) candidates.push({ group, alias, length: alias.length });
  }
  candidates.sort((a, b) => b.length - a.length);

  const found: FoundMerchant[] = [];
  const seenGroups = new Set<string>();

  for (const { group, alias } of candidates) {
    const pattern = new RegExp(
      `(^|[^a-z0-9])(${normalize(alias).replace(ESCAPE, '\\$&')})(?=[^a-z0-9]|$)`,
    );
    const m = pattern.exec(remaining);
    if (!m) continue;

    // Se consume lo hallado para que un alias más corto no vuelva a dar con
    // él. Se deja un espacio para que los límites de palabra sigan valiendo.
    // Los dos grupos son obligatorios en el patrón: siempre vienen.
    const [, before = '', match = ''] = m;
    const start = m.index + before.length;
    remaining = `${remaining.slice(0, start)} ${' '.repeat(match.length - 1)}${remaining.slice(start + match.length)}`;

    if (!seenGroups.has(group.group)) {
      seenGroups.add(group.group);
      found.push({ group, alias });
    }
  }

  return found;
}

/**
 * Los términos genéricos que un texto sugiere, en orden de seguridad.
 *
 * Es lo que se busca después en el árbol de la persona. Si varios comercios
 * aparecen a la vez —«RAPPI*EXITO»—, los términos del hallado más largo van
 * primero; quien resuelva decide qué hacer con la mezcla.
 */
export function termsFor(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const { group } of merchantsIn(text)) {
    for (const t of group.terms) {
      if (!seen.has(t)) {
        seen.add(t);
        terms.push(t);
      }
    }
  }
  return terms;
}
