import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { OverlayButton, ControlSeparator } from '@/shared/ui/molecules/overlay-control';

/**
 * Las flechas y el contador de los soportes, sobre el documento.
 *
 * Lo pintan la columna de un movimiento guardado y la de uno que se está
 * creando, y era el mismo trozo escrito dos veces. Solo aparece con más de
 * uno: con un único soporte, «1 de 1» y dos flechas apagadas son tres
 * controles que no hacen nada. La raya del final separa moverse de lo que
 * modifica (ver `SeparadorDeMandos`).
 */
export function SupportPager({
  index,
  total,
  onGo,
}: {
  index: number;
  total: number;
  onGo: (index: number) => void;
}) {
  if (total <= 1) return null;

  return (
    <>
      <OverlayButton
        label={t('transactions.supports.previous')}
        disabled={index === 0}
        onClick={() => onGo(index - 1)}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </OverlayButton>
      <span className="tabular px-1 text-xs font-medium text-sala-tinta">
        {index + 1} / {total}
      </span>
      <OverlayButton
        label={t('transactions.supports.next')}
        disabled={index === total - 1}
        onClick={() => onGo(index + 1)}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </OverlayButton>
      <ControlSeparator />
    </>
  );
}
