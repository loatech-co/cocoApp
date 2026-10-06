import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/**
 * Plegar y desplegar el riel del escritorio.
 *
 * Desplegado va arriba a la derecha, junto al logotipo, y lo que se alinea es
 * el ICONO, no su área de toque: el botón mide 36 y el icono 18, así que lleva
 * 9 de aire a cada lado, y el margen negativo (`-mr-2.25`, 9px) saca el área
 * de toque para que el canto del icono caiga sobre el de las filas de
 * navegación. Con el botón a ras del riel el icono se leía descolgado.
 *
 * Plegado ocupa el ancho del riel, encima de las secciones.
 */
export function RailToggle({ plegada, onAlternar }: { plegada: boolean; onAlternar: () => void }) {
  const etiqueta = plegada ? t('ui.railToggle.expand') : t('ui.railToggle.collapse');
  const Icono = plegada ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'grid place-items-center rounded-lg text-sidebar-muted transition-colors hover:text-sidebar-foreground',
        plegada ? 'mb-2 h-9 w-full' : '-mr-2.25 size-9 shrink-0',
      )}
    >
      <Icono className="size-4.5" aria-hidden="true" />
    </button>
  );
}
