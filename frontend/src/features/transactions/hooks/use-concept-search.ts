import { useMemo, useState } from 'react';

import { toSearchableNodes, type TreeNode } from '@/shared/lib/searchable-tree';
import { searchInTree, indexTree, type IndexEntry } from '@coco/receipt-parser';

/** What is being done inside the panel: searching, or picking where the new one goes. */
export type SearchMode = 'buscar' | 'categoria-para-nuevo';

function normal(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** What comes out of the tree for what was typed: what is picked, the results and the lists. */
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

  // Create only when what was typed does not exist yet: with a matching name,
  // «crear» would produce two identical concepts adding up separately.
  const canCreate =
    query.trim() !== '' &&
    !results.some((r) => r.level === 'concepto' && r.normalizedName === normal(query));

  return { chosen, results, recentEntries, filteredCategories, canCreate };
}

/**
 * What the sheet's concept search remembers and computes: what was typed,
 * the mode, the tree index and the lists that come out of it.
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
   * The name of the concept about to be created, while its category is picked.
   * Separate from `query`, because in that step the box switches to filtering categories and
   * if it still said «Gimnasio» it would find none.
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
  // No duplicates even if they arrive: whoever computes them already removes them, but a
  // list with the same concept twice would look like an error of the
  // search and not of whoever called it.
  return [...new Set(recent.map(String))]
    .map((r) => index.find((e) => e.level === 'concepto' && String(e.id) === r))
    .filter((e): e is IndexEntry => e !== undefined)
    .slice(0, 5);
}
