import { normalizar } from './firmas';

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
export interface GrupoDelDiccionario {
  /** Para leerlo en un informe. No se enseña. */
  grupo: string;
  /** Lo que se busca en el árbol de la persona, por nombre y palabra clave. */
  terminos: readonly string[];
  /** Tal como aparecen en el texto. Se normalizan al comparar. */
  comercios: readonly string[];
}

export const DICCIONARIO: readonly GrupoDelDiccionario[] = [
  {
    grupo: 'mercado',
    terminos: ['mercado', 'supermercado', 'viveres', 'alimentacion', 'despensa', 'tienda'],
    comercios: [
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
    grupo: 'restaurantes y domicilios',
    terminos: [
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
    comercios: [
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
    grupo: 'transporte',
    terminos: ['transporte', 'taxi', 'pasajes', 'movilidad', 'parqueadero', 'parqueaderos'],
    comercios: [
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
    grupo: 'combustible',
    terminos: ['gasolina', 'combustible', 'tanqueada', 'acpm', 'gas vehicular'],
    comercios: [
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
    grupo: 'peajes',
    terminos: ['peaje', 'peajes', 'vias', 'autopista'],
    comercios: ['peaje', 'peajes', 'flypass', 'facilpass', 'concesion vial', 'concesionaria'],
  },
  {
    grupo: 'farmacia',
    terminos: ['farmacia', 'drogueria', 'medicamentos', 'medicinas', 'drogas'],
    comercios: [
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
    grupo: 'servicios publicos',
    terminos: [
      'servicios publicos',
      'agua',
      'luz',
      'energia',
      'gas',
      'acueducto',
      'aseo',
      'alcantarillado',
    ],
    comercios: [
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
    grupo: 'telecomunicaciones',
    terminos: ['internet', 'celular', 'telefonia', 'plan', 'datos', 'television', 'cable'],
    comercios: [
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
    grupo: 'suscripciones digitales',
    terminos: [
      'suscripcion',
      'suscripciones',
      'streaming',
      'licencias',
      'licencia',
      'apps',
      'software',
    ],
    comercios: [
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
    grupo: 'salud',
    terminos: [
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
    comercios: [
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
    grupo: 'educacion',
    terminos: [
      'educacion',
      'colegio',
      'universidad',
      'matricula',
      'pension escolar',
      'curso',
      'cursos',
      'utiles',
    ],
    comercios: [
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
export const TUBERIAS: readonly string[] = [
  'mercado pago',
  'mercadopago',
  'payu',
  'wompi',
  'bold',
  'addi',
  'epayco',
  'payvalida',
];

export interface ComercioHallado {
  grupo: GrupoDelDiccionario;
  /** El alias que apareció, tal como está en el diccionario. */
  alias: string;
}

const ESCAPAR = /[.*+?^${}()|[\]\\/]/g;

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
export function comerciosEn(texto: string): ComercioHallado[] {
  let trabajo = ` ${normalizar(texto)} `;
  for (const tuberia of TUBERIAS) trabajo = trabajo.split(tuberia).join(' ');

  const candidatos: { grupo: GrupoDelDiccionario; alias: string; largo: number }[] = [];
  for (const grupo of DICCIONARIO) {
    for (const alias of grupo.comercios) candidatos.push({ grupo, alias, largo: alias.length });
  }
  candidatos.sort((a, b) => b.largo - a.largo);

  const hallados: ComercioHallado[] = [];
  const gruposVistos = new Set<string>();

  for (const { grupo, alias } of candidatos) {
    const patron = new RegExp(
      `(^|[^a-z0-9])(${normalizar(alias).replace(ESCAPAR, '\\$&')})(?=[^a-z0-9]|$)`,
    );
    const m = patron.exec(trabajo);
    if (!m) continue;

    // Se consume lo hallado para que un alias más corto no vuelva a dar con
    // él. Se deja un espacio para que los límites de palabra sigan valiendo.
    const inicio = m.index + m[1].length;
    trabajo = `${trabajo.slice(0, inicio)} ${' '.repeat(m[2].length - 1)}${trabajo.slice(inicio + m[2].length)}`;

    if (!gruposVistos.has(grupo.grupo)) {
      gruposVistos.add(grupo.grupo);
      hallados.push({ grupo, alias });
    }
  }

  return hallados;
}

/**
 * Los términos genéricos que un texto sugiere, en orden de seguridad.
 *
 * Es lo que se busca después en el árbol de la persona. Si varios comercios
 * aparecen a la vez —«RAPPI*EXITO»—, los términos del hallado más largo van
 * primero; quien resuelva decide qué hacer con la mezcla.
 */
export function terminosPara(texto: string): string[] {
  const vistos = new Set<string>();
  const terminos: string[] = [];
  for (const { grupo } of comerciosEn(texto)) {
    for (const t of grupo.terminos) {
      if (!vistos.has(t)) {
        vistos.add(t);
        terminos.push(t);
      }
    }
  }
  return terminos;
}
