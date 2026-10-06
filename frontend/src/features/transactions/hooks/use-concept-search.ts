import { useMemo, useState } from 'react';

import { toSearchableNodes, type TreeNode } from '@/shared/lib/searchable-tree';
import { searchInTree, indexTree, type IndexEntry } from '@coco/receipt-parser';

/** Qué se está haciendo dentro del panel: buscar, o elegir dónde va lo nuevo. */
export type ModoDelBuscador = 'buscar' | 'categoria-para-nuevo';

function normal(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Lo que sale del árbol para lo escrito: lo elegido, los resultados y las listas. */
function useConceptLists({
  arbol,
  valor,
  recientes,
  busca,
}: {
  arbol: readonly TreeNode[];
  valor: number | undefined;
  recientes: readonly number[];
  busca: string;
}) {
  const indice = useMemo(() => indexTree(toSearchableNodes(arbol)), [arbol]);
  const elegida = useMemo(
    () => (valor === undefined ? undefined : indice.find((e) => String(e.id) === String(valor))),
    [indice, valor],
  );
  const resultados = useMemo(() => searchInTree(indice, busca, { limit: 12 }), [indice, busca]);
  const entradasRecientes = useMemo(
    () => recientesDelIndice(indice, recientes),
    [indice, recientes],
  );
  const categorias = useMemo(() => indice.filter((e) => e.level === 'categoria'), [indice]);
  const categoriasFiltradas = useMemo(
    () =>
      busca.trim() === ''
        ? categorias
        : searchInTree(indice, busca, { levels: ['categoria'], limit: 30 }),
    [indice, categorias, busca],
  );

  // Crear solo cuando lo escrito no existe ya: con un nombre que coincide,
  // «crear» produciría dos conceptos idénticos sumando por separado.
  const puedeCrear =
    busca.trim() !== '' &&
    !resultados.some((r) => r.level === 'concepto' && r.normalizedName === normal(busca));

  return { elegida, resultados, entradasRecientes, categoriasFiltradas, puedeCrear };
}

/**
 * Lo que el buscador de conceptos de la ficha recuerda y calcula: lo escrito,
 * el modo, el índice del árbol y las listas que salen de él.
 */
export function useConceptSearch({
  arbol,
  valor,
  recientes,
}: {
  arbol: readonly TreeNode[];
  valor: number | undefined;
  recientes: readonly number[];
}) {
  const [busca, setBusca] = useState('');
  const [modo, setModo] = useState<ModoDelBuscador>('buscar');
  /**
   * El nombre del concepto que se va a crear, mientras se elige su categoría.
   * Aparte de `busca`, porque en ese paso la caja pasa a filtrar categorías y
   * si siguiera diciendo «Gimnasio» no encontraría ninguna.
   */
  const [nombreNuevo, setNombreNuevo] = useState('');
  const listas = useConceptLists({ arbol, valor, recientes, busca });

  const limpiar = (): void => {
    setBusca('');
    setNombreNuevo('');
    setModo('buscar');
  };

  const pedirCategoria = (): void => {
    setNombreNuevo(busca.trim());
    setBusca('');
    setModo('categoria-para-nuevo');
  };

  const volver = (): void => {
    setBusca(nombreNuevo);
    setNombreNuevo('');
    setModo('buscar');
  };

  return { ...listas, busca, setBusca, modo, nombreNuevo, limpiar, pedirCategoria, volver };
}

function recientesDelIndice(
  indice: readonly IndexEntry[],
  recientes: readonly number[],
): IndexEntry[] {
  // Sin repetidos aunque lleguen: quien los calcula ya los quita, pero una
  // lista con el mismo concepto dos veces se vería como un error del
  // buscador y no de quien lo llamó.
  return [...new Set(recientes.map(String))]
    .map((r) => indice.find((e) => e.level === 'concepto' && String(e.id) === r))
    .filter((e): e is IndexEntry => e !== undefined)
    .slice(0, 5);
}
