import { useEffect } from 'react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';

import { DropZone } from './support-drop-zone';

/**
 * El cuadro de subir, sobre la ficha que lo pidió.
 *
 * ── Por qué un panel encima y no un paso dentro ─────────────────────────────
 * Porque añadir un soporte no es una etapa del formulario: es algo que se hace
 * EN MEDIO de otra cosa —revisando una ficha, corrigiendo una cifra— y se
 * vuelve a lo que se estaba haciendo. Un paso obliga a salir de la ficha,
 * cambia lo que se ve y deja la duda de si lo escrito sigue ahí; un panel
 * encima deja la ficha a la vista, detrás.
 *
 * Y sirve para los dos sitios que lo abren: la vía «Subir un archivo» de un
 * movimiento nuevo y la baldosa de la galería de uno que ya tiene soportes. Sin
 * él eran dos pantallas distintas para el mismo gesto.
 *
 * ── Por qué Escape se atrapa en CAPTURA ─────────────────────────────────────
 * La ficha del movimiento escucha Escape en el documento para cerrarse. Este
 * panel se monta después, así que su oyente correría el segundo y la ficha se
 * cerraría igual —con lo escrito dentro—. En captura llega primero y detiene
 * el evento: Escape cierra el panel y nada más.
 */
export function UploadPanel({
  isUploading,
  progress,
  onFiles,
  onClose,
}: {
  isUploading: boolean;
  progress: number;
  onFiles: (files: File[]) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onPress = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', onPress, true);
    return () => document.removeEventListener('keydown', onPress, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('transactions.supports.add')}
      // Por encima de la ficha, que está en z-50, igual que el pase.
      className={cn(
        'fixed inset-0 z-[60] flex items-end justify-center bg-[var(--velo)] backdrop-blur-sm',
        // 24 hasta el canto de la pantalla, como todas las fichas del teléfono.
        'p-6',
        'se-revela sm:items-center sm:p-4',
      )}
      // `onMouseDown` y no `onClick`: con clic, arrastrar desde dentro del
      // panel hasta el velo —que es justo lo que se hace al soltar un
      // archivo— lo cerraría a mitad del gesto.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          'flex w-full flex-col p-4 sm:max-w-xl sm:p-5',
          FLOATING_SURFACE,
          'emerge rounded-lg',
        )}
      >
        <DropZone isUploading={isUploading} progress={progress} isAlone onFiles={onFiles} />
      </div>
    </div>
  );
}
