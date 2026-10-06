import type { ReadingProgress } from '@/features/transactions/api/read-receipt';
import { t } from '@/shared/lib/i18n';
import { useObjectUrl } from '@/shared/lib/object-url';
import { cn } from '@/shared/lib/utils';
import { PdfCanvas } from '@/shared/ui/atoms/pdf-canvas';
import { Progress } from '@/shared/ui/atoms/progress';

/**
 * El documento, con una banda de luz cruzándolo mientras se lee.
 *
 * ── Por qué se enseña el documento y no un girador ─────────────────────────
 * Porque un girador dice «espera» y nada más: es el mismo dibujo para cargar
 * una lista, guardar un formulario o leer un recibo. Aquí está pasando algo
 * concreto y que se puede enseñar —una máquina está mirando ESE papel—, y
 * enseñarlo hace dos cosas que el girador no: se entiende que la espera tiene
 * un motivo, y se ve qué documento se está leyendo, que es justo el dato que
 * hace falta si lo que sale no cuadra.
 *
 * El `blob:` vive exactamente lo que dura este paso: ver `useObjectUrl`.
 */
export function Scanning({
  file,
  progress,
}: {
  file: File | undefined;
  progress: ReadingProgress | null;
}) {
  const url = useObjectUrl(file);
  const isImage = file?.type.startsWith('image/') ?? false;
  const stage = progress?.stage ?? t('transactions.reading.reading');

  return (
    <div className="flex flex-col items-center gap-4 py-6" role="status" aria-live="polite">
      {/*
        El cristal del escáner: el documento dentro, recortado, y las dos capas
        del barrido encima. `overflow-hidden` es lo que mantiene la banda
        dentro del marco, y `select-none` evita que un arrastre sobre él
        seleccione media ficha.
      */}
      <div
        className={cn(
          'relative w-full max-w-sm select-none overflow-hidden rounded-lg',
          'border border-border bg-card',
          // Una hoja es más alta que ancha. Fijando la proporción, el marco no
          // cambia de tamaño cuando la imagen acaba de cargar.
          'aspect-[3/4]',
        )}
      >
        {url === null ? null : isImage ? (
          // `object-top`: lo que hace falta ver de un recibo está arriba —el
          // comercio, la fecha—, no en su centro geométrico.
          <img src={url} alt="" className="size-full object-cover object-top opacity-80" />
        ) : (
          <div className="grid size-full place-items-center overflow-hidden">
            <PdfCanvas url={url} />
          </div>
        )}

        <ScanSweep />
      </div>

      <p className="text-sm font-medium">{stage}</p>

      {/* El OCR de un escaneo tarda segundos y sin barra parece colgado. La
          barra es la compartida: esta medía 4px de alto y 192 de ancho y la de
          la importación 8px y todo el ancho, siendo la misma espera del mismo
          trabajo. */}
      <Progress value={progress?.progress ?? 0} label={stage} className="w-full max-w-sm" />
    </div>
  );
}

/** Las dos capas del barrido, encima del documento. */
function ScanSweep() {
  return (
    <>
      {/*
        El rastro: lo ya barrido queda un poco más claro que lo que falta.
        Sin esto la banda parece un reflejo suelto pasando por encima; con
        él, parece que va dejando el trabajo hecho detrás.
      */}
      <span
        aria-hidden="true"
        className="deja-rastro pointer-events-none absolute inset-0 bg-accent/25"
      />

      {/* La banda, con su canto de avance brillante. */}
      <span
        aria-hidden="true"
        className={cn(
          'barre pointer-events-none absolute inset-y-0 left-0 w-1/4',
          'bg-gradient-to-r from-transparent via-acento-tinta/30 to-transparent',
        )}
      >
        <span className="absolute inset-y-0 right-0 w-px bg-acento-tinta shadow-[0_0_12px_2px_var(--acento-tinta)]" />
      </span>
    </>
  );
}
