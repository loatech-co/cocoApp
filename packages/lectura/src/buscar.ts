import { normalizar } from './firmas';

/**
 * Buscar en el árbol de categorías de una persona.
 *
 * ── Por qué vive aquí y no en el frontend ───────────────────────────────────
 * Porque lo usan dos cosas que no se conocen: el buscador de la ficha de un
 * movimiento, en el navegador, y el diccionario del sistema, que traduce un
 * comercio a términos genéricos y necesita encontrarlos en el árbol de cada
 * cuenta. Escrito dos veces, «mercado» encontraría «Mercado» en un sitio y no
 * en el otro. Y en la fase 3 este motor pasa a la API, que lo hereda tal cual.
 *
 * ── Por qué corre en el navegador y no en el servidor ───────────────────────
 * Un árbol tiene treinta y pico conceptos. Buscar en él es recorrer una lista
 * que ya está descargada; una petición por tecla sería pedirle a la red que
 * haga lo que cabe en un `filter`.
 *
 * ── Qué se busca ────────────────────────────────────────────────────────────
 * Los nombres de los conceptos y de las categorías, y sus palabras clave: si
 * «Mercado» tiene la palabra clave «D1», escribir «d1» lo encuentra. Sin
 * tildes ni mayúsculas, con la misma normalización que todo lo demás.
 */

/** Lo mínimo que un nodo del árbol necesita para poder buscarse. */
export interface NodoBuscable {
  id: number | string;
  name: string;
  palabras_clave?: readonly string[];
  children?: readonly NodoBuscable[];
}

export type NivelDelArbol = 'centro' | 'categoria' | 'concepto';

/** Un nodo del árbol, aplanado y listo para comparar. */
export interface EntradaDelIndice {
  id: number | string;
  nivel: NivelDelArbol;
  nombre: string;
  /**
   * De dónde cuelga, del más cercano al más lejano: para un concepto,
   * `[categoría, centro]`; para una categoría, `[centro]`. Es lo que distingue
   * dos «Mercado» en la pantalla.
   */
  ruta: readonly string[];
  centroId: number | string;
  categoriaId?: number | string;
  palabrasClave: readonly string[];
  /** Normalizados una vez, al indexar, y no en cada tecla. */
  nombreNormalizado: string;
  palabrasNormalizadas: readonly string[];
}

/** Aplana el árbol. Se hace una vez por árbol, no una vez por búsqueda. */
export function indexarArbol(raices: readonly NodoBuscable[]): EntradaDelIndice[] {
  const entradas: EntradaDelIndice[] = [];

  for (const centro of raices) {
    entradas.push(entrada(centro, 'centro', [], centro.id));
    for (const categoria of centro.children ?? []) {
      entradas.push(entrada(categoria, 'categoria', [centro.name], centro.id));
      for (const concepto of categoria.children ?? []) {
        entradas.push(
          entrada(concepto, 'concepto', [categoria.name, centro.name], centro.id, categoria.id),
        );
      }
    }
  }

  return entradas;
}

function entrada(
  nodo: NodoBuscable,
  nivel: NivelDelArbol,
  ruta: readonly string[],
  centroId: number | string,
  categoriaId?: number | string,
): EntradaDelIndice {
  const palabrasClave = nodo.palabras_clave ?? [];
  return {
    id: nodo.id,
    nivel,
    nombre: nodo.name,
    ruta,
    centroId,
    categoriaId,
    palabrasClave,
    nombreNormalizado: normalizar(nodo.name),
    palabrasNormalizadas: palabrasClave.map(normalizar),
  };
}

/**
 * Cuánto se parece una entrada a lo escrito. Cero es nada.
 *
 * El orden importa más que el número: el nombre exacto gana al que empieza
 * igual, que gana al que lo contiene, que gana a la palabra clave. Escribir
 * «mercado» tiene que poner «Mercado» antes que «Supermercado», y los dos
 * antes que un concepto que tenga «mercado» como palabra clave.
 */
function puntuar(e: EntradaDelIndice, tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    let mejor = 0;
    if (e.nombreNormalizado === token) mejor = 4;
    else if (e.nombreNormalizado.startsWith(token)) mejor = 3;
    else if (e.nombreNormalizado.includes(token)) mejor = 2;
    else if (e.palabrasNormalizadas.some((p) => p === token || p.includes(token))) mejor = 1;
    // Todos los tokens tienen que encontrarse en algún sitio: «mercado d1» no
    // debe traer todo lo que diga «mercado» aunque no sepa nada de «d1».
    if (mejor === 0) return 0;
    total += mejor;
  }
  return total;
}

/**
 * Busca lo escrito en el índice. Vacío devuelve vacío: lo que se enseña con
 * el buscador en blanco —los recientes— lo decide quien llama.
 */
export function buscarEnArbol(
  indice: readonly EntradaDelIndice[],
  consulta: string,
  opciones: { niveles?: readonly NivelDelArbol[]; limite?: number } = {},
): EntradaDelIndice[] {
  const tokens = normalizar(consulta).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  // Conceptos y categorías por defecto. Un centro de costos solo no clasifica
  // nada: elegirlo dejaría el movimiento igual de sin clasificar.
  const niveles = new Set(opciones.niveles ?? ['concepto', 'categoria']);
  const PESO_DEL_NIVEL: Record<NivelDelArbol, number> = { concepto: 2, categoria: 1, centro: 0 };

  return indice
    .filter((e) => niveles.has(e.nivel))
    .map((e) => ({ e, puntos: puntuar(e, tokens) }))
    .filter(({ puntos }) => puntos > 0)
    .sort(
      (a, b) =>
        b.puntos - a.puntos ||
        // A igual parecido, el concepto antes que la categoría: es lo que
        // clasifica del todo.
        PESO_DEL_NIVEL[b.e.nivel] - PESO_DEL_NIVEL[a.e.nivel] ||
        a.e.nombre.localeCompare(b.e.nombre, 'es'),
    )
    .slice(0, opciones.limite ?? 20)
    .map(({ e }) => e);
}

/** El camino de una entrada tal como se enseña: «Familia › Costos fijos». */
export function rutaLegible(e: EntradaDelIndice): string {
  return e.ruta.join(' › ');
}

// ── Resolver términos genéricos: lo que usa el diccionario ───────────────────

export type Certeza = 'alta' | 'media' | 'ninguna';

export interface Resolucion {
  certeza: Certeza;
  /** Solo con certeza alta: el único concepto al que llevan los términos. */
  concepto?: EntradaDelIndice;
  /**
   * Con certeza media: la categoría que se propone, si los términos llevan a
   * una sola. Varios conceptos de categorías distintas no proponen ninguna.
   */
  categoria?: EntradaDelIndice;
  /** Con certeza media: entre qué se está dudando, para dejarlo a la vista. */
  candidatos: EntradaDelIndice[];
}

/**
 * A dónde llevan unos términos genéricos dentro del árbol de alguien.
 *
 * ── Los tres niveles de certeza ─────────────────────────────────────────────
 * · ALTA: los términos llevan a un solo concepto. Se propone.
 * · MEDIA: llevan a una categoría pero a ningún concepto, o a varios
 *   conceptos. Se propone la categoría —si es una sola— y se dejan los
 *   candidatos a la vista para que la persona elija.
 * · NINGUNA: no llevan a nada. No se propone nada; el buscador queda listo.
 *
 * Nunca se adivina entre varios: «mercado» y «supermercado» pueden ser dos
 * conceptos distintos de la misma cuenta, y elegir uno sería mover plata a un
 * sitio que nadie pidió.
 */
export function resolverTerminos(
  indice: readonly EntradaDelIndice[],
  terminos: readonly string[],
): Resolucion {
  const conceptos = new Map<string, EntradaDelIndice>();
  const categorias = new Map<string, EntradaDelIndice>();

  for (const termino of terminos) {
    for (const hallada of buscarEnArbol(indice, termino)) {
      const clave = String(hallada.id);
      if (hallada.nivel === 'concepto') conceptos.set(clave, hallada);
      else if (hallada.nivel === 'categoria') categorias.set(clave, hallada);
    }
  }

  if (conceptos.size === 1) {
    return { certeza: 'alta', concepto: [...conceptos.values()][0], candidatos: [] };
  }

  if (conceptos.size > 1) {
    const candidatos = [...conceptos.values()];
    const categoriasDeLosCandidatos = new Set(candidatos.map((c) => String(c.categoriaId)));
    const categoria =
      categoriasDeLosCandidatos.size === 1
        ? indice.find(
            (e) => e.nivel === 'categoria' && String(e.id) === [...categoriasDeLosCandidatos][0],
          )
        : undefined;
    return { certeza: 'media', categoria, candidatos };
  }

  if (categorias.size >= 1) {
    const candidatas = [...categorias.values()];
    return {
      certeza: 'media',
      categoria: candidatas.length === 1 ? candidatas[0] : undefined,
      candidatos: candidatas,
    };
  }

  return { certeza: 'ninguna', candidatos: [] };
}
