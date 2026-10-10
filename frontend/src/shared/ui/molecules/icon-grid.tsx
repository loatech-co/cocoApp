import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { CATEGORY_ICONS, CategoryIcon } from '@/shared/ui/atoms/icons';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * The icon grid of a category, already filtered: one is picked by pressing it.
 *
 * Switched on it carries the filled primary: it is the only thing that says
 * which one is set, because there is no check mark or text (the exception to
 * rule 8).
 */
export function IconGrid({
  icons,
  value,
  onSelect,
}: {
  icons: typeof CATEGORY_ICONS;
  value: string | null;
  onSelect: (icon: string | null) => void;
}) {
  return (
    <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-8">
      {icons.map(({ name, label }) => {
        const isSelected = value === name;

        return (
          <button
            key={name}
            type="button"
            // Pressing the one already set removes it: it is the gesture
            // everyone tries to undo a choice, and without it a "none"
            // button taking up a slot of the grid would be needed.
            onClick={() => onSelect(isSelected ? null : name)}
            aria-pressed={isSelected}
            title={label}
            aria-label={label}
            className={cn(
              'grid aspect-square place-items-center rounded-md transition-colors',
              'mobile:min-h-[42px]',
              isSelected
                ? 'bg-primary text-primary-foreground'
                : cn('text-muted-foreground', HIGHLIGHT),
            )}
          >
            <CategoryIcon name={name} className="size-4" />
          </button>
        );
      })}

      {icons.length === 0 && (
        <p className="col-span-full px-1 py-2 text-sm text-muted-foreground">
          {t('ui.iconGrid.noMatch')}
        </p>
      )}
    </div>
  );
}
