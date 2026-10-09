import { useEffect, useId, useState } from 'react';

import { useOnChange } from './on-change';

/**
 * The option the arrows point at, while the cursor stays in the search box.
 *
 * ── Why `aria-activedescendant` and not moving the focus ────────────────────
 * Because the search box has to keep the caret: moving the focus to the row
 * means every letter typed after an arrow is lost. The box says which row is
 * active, and a screen reader reads that row as if it had the focus.
 *
 * `values` are the rows in the order they are drawn; `query` is what was
 * typed, because a new search is a new list and the old index would point at
 * another row.
 */
export function useActiveOption(values: string[], query: string) {
  const listId = useId();
  const [active, setActive] = useState(-1);
  useOnChange([query, values.length], () => setActive(-1));

  const optionId = (index: number) => `${listId}-${String(index)}`;
  const activeId = active >= 0 && active < values.length ? optionId(active) : undefined;

  // The list scrolls: the row the arrows reach has to stay in sight.
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  /** Moves with the arrows. Returns whether the key was its own. */
  function move(key: string): boolean {
    if (key === 'ArrowDown') setActive((i) => Math.min(i + 1, values.length - 1));
    else if (key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else return false;
    return true;
  }

  return {
    listId,
    optionId,
    activeId,
    activeValue: activeId ? values[active] : undefined,
    move,
    /** What the search box says about the list it controls. */
    boxProps: {
      role: 'combobox',
      'aria-expanded': true,
      'aria-controls': listId,
      'aria-autocomplete': 'list',
      'aria-activedescendant': activeId,
    } as const,
  };
}
