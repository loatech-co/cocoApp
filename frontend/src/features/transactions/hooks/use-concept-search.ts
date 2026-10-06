import { useMemo, useState } from 'react';

import { toSearchableNodes, type TreeNode } from '@/shared/lib/searchable-tree';
import { searchInTree, indexTree, type IndexEntry } from '@coco/receipt-parser';

/** Qué se está haciendo dentro del panel: buscar, o elegir dónde va lo nuevo. */
export type SearchMode = 'buscar' | 'categoria-para-nuevo';

function normal(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Lo que sale del árbol para lo escrito: lo elegido, los resultados y las listas. */
function useConceptLists({
  tree,
  value,
  recent,
  query,
}: {
  tree: readonly TreeNode[];
  value: number | undefined;
  recent: readonly number[];
  query: string;
}) {
  const index = useMemo(() => indexTree(toSearchableNodes(tree)), [tree]);
  const chosen = useMemo(
    () => (value === undefined ? undefined : index.find((e) => String(e.id) === String(value))),
    [index, value],
  );
  const results = useMemo(() => searchInTree(index, query, { limit: 12 }), [index, query]);
  const recentEntries = useMemo(() => recentFromIndex(index, recent), [index, recent]);
  const categories = useMemo(() => index.filter((e) => e.level === 'categoria'), [index]);
  const filteredCategories = useMemo(
    () =>
      query.trim() === ''
        ? categories
        : searchInTree(index, query, { levels: ['categoria'], limit: 30 }),
    [index, categories, query],
  );

  // Crear solo cuando lo escrito no existe ya: con un nombre que coincide,
  // «crear» produciría dos conceptos idénticos sumando por separado.
  const canCreate =
    query.trim() !== '' &&
    !results.some((r) => r.level === 'concepto' && r.normalizedName === normal(query));

  return { chosen, results, recentEntries, filteredCategories, canCreate };
}

/**
 * Lo que el buscador de conceptos de la ficha recuerda y calcula: lo escrito,
 * el modo, el índice del árbol y las listas que salen de él.
 */
export function useConceptSearch({
  tree,
  value,
  recent,
}: {
  tree: readonly TreeNode[];
  value: number | undefined;
  recent: readonly number[];
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('buscar');
  /**
   * El nombre del concepto que se va a crear, mientras se elige su categoría.
   * Aparte de `busca`, porque en ese paso la caja pasa a filtrar categorías y
   * si siguiera diciendo «Gimnasio» no encontraría ninguna.
   */
  const [newName, setNewName] = useState('');
  const lists = useConceptLists({ tree, value, recent, query });

  const clear = (): void => {
    setQuery('');
    setNewName('');
    setMode('buscar');
  };

  const askForCategory = (): void => {
    setNewName(query.trim());
    setQuery('');
    setMode('categoria-para-nuevo');
  };

  const back = (): void => {
    setQuery(newName);
    setNewName('');
    setMode('buscar');
  };

  return { ...lists, query, setQuery, mode, newName, clear, askForCategory, back };
}

function recentFromIndex(index: readonly IndexEntry[], recent: readonly number[]): IndexEntry[] {
  // Sin repetidos aunque lleguen: quien los calcula ya los quita, pero una
  // lista con el mismo concepto dos veces se vería como un error del
  // buscador y no de quien lo llamó.
  return [...new Set(recent.map(String))]
    .map((r) => index.find((e) => e.level === 'concepto' && String(e.id) === r))
    .filter((e): e is IndexEntry => e !== undefined)
    .slice(0, 5);
}
