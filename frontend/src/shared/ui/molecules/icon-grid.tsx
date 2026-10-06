import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { CATEGORY_ICONS, CategoryIcon } from '@/shared/ui/atoms/icons';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * La rejilla de iconos de una categoría, ya filtrada: se elige uno pulsándolo.
 *
 * Encendido lleva el primario lleno: es lo único que dice cuál está puesto,
 * porque no hay palomita ni texto (la excepción de la regla 8).
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
            // Pulsar el que ya está puesto lo quita: es el gesto que todo
            // el mundo prueba para deshacer una elección, y sin él haría
            // falta un botón de "ninguno" ocupando una plaza de la rejilla.
            onClick={() => onSelect(isSelected ? null : name)}
            aria-pressed={isSelected}
            title={label}
            aria-label={label}
            className={cn(
              'grid aspect-square place-items-center rounded-md transition-colors',
              'movil:min-h-[42px]',
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
