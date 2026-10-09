import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Donut } from '@/shared/ui/atoms/donut';
import { BackCrumb } from '@/shared/ui/atoms/level-nav';

interface DistributionProps {
  rows: { categoryId: number | null; name: string; total: string; count: number }[];
  level: string;
  /** Whose rows these are. `null` when they are the cost centers. */
  parent: { id: number; name: string } | null;
  totalSpent: string;
  /** The path down to where you drilled. Empty = you are at the cost centers. */
  path: { id: number; name: string }[];
  onDrillDown: (id: number) => void;
  onDrillUp: () => void;
}

/**
 * What it went on, at the level that applies.
 *
 * Each row goes DOWN a level when tapped: from centers to categories, from categories
 * to concepts. It is the way to answer "and inside this, what?" without changing
 * screens or losing the date range.
 */
/**
 * How the spending was split.
 *
 * ── Why a donut and not bars ────────────────────────────────────────────────
 * Because the question is about PROPORTION, not ranking: how much each
 * center takes OF THE TOTAL. A row of bars compares them with each other and leaves
 * the total implicit; the donut puts it in the middle and each slice reads against
 * it without doing any math.
 */
export function Distribution({
  rows,
  level,
  parent,
  totalSpent,
  path,
  onDrillDown,
  onDrillUp,
}: DistributionProps) {
  const total = Number.parseFloat(totalSpent) || 0;
  const [isList, setIsList] = useState(true);

  return (
    <Card className="h-full min-h-0">
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">
            {t('transactions.distribution.title')}
          </h2>
          <ShowNames isList={isList} onToggle={() => setIsList((wasList) => !wasList)} />
        </div>

        {/* Going down a level is one click; going up has to be one too. Without this,
            entering a cost center was a one-way trip: the only way out
            was clearing the whole filter from the bar above. */}
        {path.length > 0 ? (
          <div className="flex min-w-0 self-start">
            <BackCrumb path={path.map((n) => n.name)} onBack={onDrillUp} />
          </div>
        ) : (
          /* The NAME of whom these rows belong to, not the level they
             are at. "Por categoría" does not say of what: the categories of which center. */
          <p className="truncate text-xs text-muted-foreground">
            {parent?.name ?? t('transactions.distribution.byLevel', { level })}
          </p>
        )}

        {/* `flex-1` so the donut has something to measure against: the card already
            has a height —the row gave it one— and this is the piece it has left. */}
        <Donut
          className="mt-6 min-h-0 flex-1"
          isListVisible={isList}
          total={total}
          portions={rows.map((f) => ({
            id: f.categoryId,
            name: f.name,
            value: Number.parseFloat(f.total) || 0,
          }))}
          onSelect={level === 'concepto' ? undefined : onDrillDown}
        />
      </CardContent>
    </Card>
  );
}

/* Hiding the names does not change the card's width: the dashboard
    grid sets it, not what is inside. */
/* Same button as the ones in the filter bar: the `tool`
    variant and the `sm-icon` size. A control that does the
    same —turning something in the view on and off— has to look the same
    on both screens. */
function ShowNames({ isList, onToggle }: { isList: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="tool"
      size="sm-icon"
      aria-pressed={!isList}
      aria-label={
        isList ? t('transactions.distribution.hideNames') : t('transactions.distribution.showNames')
      }
      title={
        isList ? t('transactions.distribution.hideNames') : t('transactions.distribution.showNames')
      }
      onClick={onToggle}
    >
      {isList ? (
        <Eye className="size-4" aria-hidden="true" />
      ) : (
        <EyeOff className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}
