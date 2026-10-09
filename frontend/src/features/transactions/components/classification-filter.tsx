import { useState } from 'react';

import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/ui/atoms/checkbox';
import { BackCrumb, DrillButton } from '@/shared/ui/atoms/level-nav';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * The filter by cost centers, categories and concepts.
 *
 * ── Why checkboxes and not a single-choice list ─────────────────────────────
 * Because the usual question is not "how much does Casa cost me?" but "how much do
 * Casa and Transporte cost me together?". With a single choice you have to look twice
 * and add up by hand.
 *
 * ── Why checking and drilling down are two different gestures ──────────────
 * They used to be the same: picking a center filtered it and also showed its
 * categories. With checkboxes that stops working —checking three centers would move the
 * list three times— so the checkbox checks and the arrow drills down. Each gesture does
 * one thing and only one.
 *
 * ── Why the path is a line and not loose breadcrumbs ────────────────────────
 * Because the panel measures 18rem: three buttons with separators break into two
 * lines at the second level. A single line with the back arrow says the
 * same, always takes the same height and has a single place to press.
 */
export function ClassificationFilter({
  tree,
  checked,
  onChange,
}: {
  tree: CategoryTree[];
  checked: number[];
  onChange: (ids: number[]) => void;
}) {
  /**
   * The path down to the level being listed. Empty = the centers.
   *
   * It lives here and not in the URL because it is NAVIGATION, not a cut: two people
   * with the same filter can be looking at different levels of the panel, and
   * that does not change what either of them sees on the screen behind.
   */
  const [path, setPath] = useState<CategoryTree[]>([]);

  const actual = path[path.length - 1];
  const list = actual ? (actual.children ?? []) : tree;

  const toggle = (id: number): void => {
    onChange(checked.includes(id) ? checked.filter((n) => n !== id) : [...checked, id]);
  };

  /** Checked further down: the parent says so without claiming it is checked itself. */
  const hasCheckedInside = (node: CategoryTree): boolean =>
    (node.children ?? []).some((child) => checked.includes(child.id) || hasCheckedInside(child));

  return (
    <div className="flex flex-col">
      <FilterPath path={path} onBack={() => setPath(path.slice(0, -1))} />

      {/* Limited height: a center with forty concepts would make a menu
          longer than the screen with no way to reach the bottom. */}
      <ul className="max-h-64 overflow-y-auto border-y border-border py-1">
        {list.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {t('transactions.classificationFilter.nothingToExpand')}
          </li>
        ) : (
          list.map((node) => {
            const isChecked = checked.includes(node.id);

            return (
              <FilterRow
                key={node.id}
                node={node}
                isChecked={isChecked}
                hasCheckedInside={!isChecked && hasCheckedInside(node)}
                onToggle={() => toggle(node.id)}
                onEnter={() => setPath([...path, node])}
              />
            );
          })
        )}
      </ul>

      <FilterFooter checked={checked} onClear={() => onChange([])} />
    </div>
  );
}

function FilterFooter({ checked, onClear }: { checked: number[]; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        {checked.length === 0
          ? t('transactions.classificationFilter.unfiltered')
          : checked.length === 1
            ? t('transactions.classificationFilter.markedOne', { n: checked.length })
            : t('transactions.classificationFilter.markedMany', { n: checked.length })}
      </span>
      {checked.length > 0 && (
        <TextButton tone="primary" onClick={onClear}>
          {t('transactions.classificationFilter.clear')}
        </TextButton>
      )}
    </div>
  );
}

interface FilterRowProps {
  node: CategoryTree;
  isChecked: boolean;
  /** There is something checked further down: a dot says so. */
  hasCheckedInside: boolean;
  onToggle: () => void;
  onEnter: () => void;
}

/** A row: the checkbox with its name, and the arrow to drill down a level. */
function FilterRow({ node, isChecked, hasCheckedInside, onToggle, onEnter }: FilterRowProps) {
  const children = node.children ?? [];
  return (
    <li className="flex items-stretch">
      <label
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-3 pr-2 text-sm transition-colors',
          // The ROW is the control: the 16 box is a second,
          // smaller way of hitting a target that is already the whole
          // width of the dropdown. That is why the row has a floor and the
          // box does not.
          'movil:min-h-[42px]',
          HIGHLIGHT,
          isChecked && 'font-medium',
        )}
      >
        <Checkbox checked={isChecked} onChange={onToggle} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {hasCheckedInside && (
          <span
            aria-hidden="true"
            title={t('transactions.classificationFilter.somethingMarked')}
            className="size-1.5 shrink-0 rounded-full bg-primary"
          />
        )}
      </label>

      {children.length > 0 && <DrillButton name={node.name} onDrill={onEnter} />}
    </li>
  );
}

/** Where you are: the levels walked, and the way back to the one above. */
function FilterPath({ path, onBack }: { path: CategoryTree[]; onBack: () => void }) {
  return (
    <div className="flex min-h-9 items-center gap-1 px-3 py-1.5">
      {path.length > 0 ? (
        <BackCrumb path={path.map((n) => n.name)} isStrong onBack={onBack} />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {t('shell.sections.costCenters')}
        </span>
      )}
    </div>
  );
}
