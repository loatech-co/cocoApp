import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { CATEGORY_ICONS, CategoryIcon } from '@/shared/ui/atoms/icons';
import { REALCE } from '@/shared/ui/foundations/superficie';

/**
 * La rejilla de iconos de una categoría, ya filtrada: se elige uno pulsándolo.
 *
 * Encendido lleva el primario lleno: es lo único que dice cuál está puesto,
 * porque no hay palomita ni texto (la excepción de la regla 8).
 */
export function IconGrid({
  filtrados,
  valor,
  onElegir,
}: {
  filtrados: typeof CATEGORY_ICONS;
  valor: string | null;
  onElegir: (icono: string | null) => void;
}) {
  return (
    <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-8">
      {filtrados.map(({ name: nombre, label: etiqueta }) => {
        const elegido = valor === nombre;

        return (
          <button
            key={nombre}
            type="button"
            // Pulsar el que ya está puesto lo quita: es el gesto que todo
            // el mundo prueba para deshacer una elección, y sin él haría
            // falta un botón de "ninguno" ocupando una plaza de la rejilla.
            onClick={() => onElegir(elegido ? null : nombre)}
            aria-pressed={elegido}
            title={etiqueta}
            aria-label={etiqueta}
            className={cn(
              'grid aspect-square place-items-center rounded-md transition-colors',
              'movil:min-h-[42px]',
              elegido ? 'bg-primary text-primary-foreground' : cn('text-muted-foreground', REALCE),
            )}
          >
            <CategoryIcon name={nombre} className="size-4" />
          </button>
        );
      })}

      {filtrados.length === 0 && (
        <p className="col-span-full px-1 py-2 text-sm text-muted-foreground">
          {t('ui.iconGrid.noMatch')}
        </p>
      )}
    </div>
  );
}
