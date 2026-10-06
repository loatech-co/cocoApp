import { ClipboardPaste, FileText, ImagePlus, Loader2, Upload } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';

import { usePasteScreenshot } from '@/features/transactions/hooks/use-paste-screenshot';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { DropSurface } from '@/shared/ui/atoms/drop-surface';
import { FilePicker } from '@/shared/ui/atoms/file-picker';

/** Soltar archivos encima: se marca mientras pasan por encima y se entregan al soltar. */
function useFileDrop(isUploading: boolean, onFiles: (files: File[]) => void) {
  const [isDragOver, setIsDragOver] = useState(false);

  return {
    isDragOver,
    handlers: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
      },
      onDragLeave: () => setIsDragOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!isUploading) onFiles(Array.from(e.dataTransfer.files));
      },
    },
  };
}

interface DropZoneProps {
  isUploading: boolean;
  progress: number;
  /** Sin ningún soporte todavía: ocupa el ancho y explica. */
  isAlone: boolean;
  /**
   * Qué hace la baldosa pequeña al pulsarse, si no es abrir el buscador.
   *
   * La galería la usa para llevar al cuadro grande en vez de al buscador del
   * sistema: en 104px no caben ni la explicación de qué se acepta ni el botón
   * de pegar, así que la baldosa pasó a ser una PUERTA y el cuadro grande el
   * sitio donde de verdad se añade.
   */
  onPress?: () => void;
  onFiles: (files: File[]) => void;
}

/**
 * El hueco donde se sueltan los recibos.
 *
 * ── Por qué es un cuadro punteado y no un botón ─────────────────────────────
 * Porque ocupa una plaza en la misma fila que las miniaturas y del mismo
 * tamaño: se lee como el sitio del próximo soporte, no como una acción en otro
 * sitio de la ficha. Y el borde punteado es lo que en todas partes significa
 * "aquí cabe algo que todavía no está" —un botón sólido diría lo contrario,
 * que ahí ya hay una cosa—.
 *
 * ── Por qué también acepta que se suelte encima ─────────────────────────────
 * Porque el recibo casi siempre viene de otra ventana: del correo, de la
 * carpeta de descargas. Obligar a pasar por el diálogo de archivos es pedir
 * que se busque a mano lo que ya se tiene agarrado.
 *
 * ── Una CAJA, no un botón ───────────────────────────────────────────────────
 * Era un `<button>` entero, y por eso el botón de pegar tuvo que vivir fuera,
 * debajo: un botón dentro de otro no es HTML válido. Pero el pegar es una de
 * las tres formas de dar un archivo —arrastrarlo, elegirlo, pegarlo— y ponerlo
 * fuera lo dejaba pareciendo otra cosa, colgando del cuadro en vez de siendo
 * parte de él.
 *
 * Así que el cuadro es una caja, y quien abre el buscador de archivos es un
 * botón que la cubre entera por debajo del contenido. El resultado a la vista
 * es el mismo —se pulsa en cualquier parte del cuadro y se abre el buscador— y
 * encima cabe lo que haga falta dentro.
 */
export function DropZone({ isUploading, progress, isAlone, onPress, onFiles }: DropZoneProps) {
  const field = useRef<HTMLInputElement>(null);
  const isDropping = useFileDrop(isUploading, onFiles);
  const { paste, pasteProblem } = usePasteScreenshot(onFiles);

  return (
    <div className={cn(isAlone && 'flex w-full self-stretch')} {...isDropping.handlers}>
      <DropSurface
        shape={isAlone ? 'full' : 'square'}
        isOver={isDropping.isDragOver}
        isBusy={isUploading}
        label={t('transactions.supports.add')}
        onPick={onPress ?? (() => field.current?.click())}
      >
        <DropZoneLabel isUploading={isUploading} progress={progress} isAlone={isAlone} />

        {/* La tercera forma de dar un archivo, dentro del cuadro y con las
            otras dos: separada, se leía como otra cosa colgando debajo.

            `relative` para quedar por encima del botón que cubre la caja, o el
            clic se lo llevaría él. */}
        {isAlone && !isUploading && (
          <PasteScreenshot onPaste={() => void paste()} problem={pasteProblem} />
        )}
      </DropSurface>

      <FilePicker
        ref={field}
        multiple
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
        onFiles={onFiles}
      />
    </div>
  );
}

/** El botón de pegar y, si el portapapeles no se dejó leer, por qué. */
function PasteScreenshot({ onPaste, problem }: { onPaste: () => void; problem: string | null }) {
  return (
    <div className="relative mt-4 flex flex-col items-center gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onPaste}>
        <ClipboardPaste aria-hidden="true" />
        {t('transactions.supports.paste')}
      </Button>
      {problem && (
        <p role="alert" className="max-w-xs text-center text-xs text-muted-foreground">
          {problem}
        </p>
      )}
    </div>
  );
}

/** Lo que se lee dentro del cuadro: el avance, la explicación o el rótulo corto. */
function DropZoneLabel({
  isUploading,
  progress,
  isAlone,
}: {
  isUploading: boolean;
  progress: number;
  isAlone: boolean;
}) {
  return (
    <div className="pointer-events-none relative flex flex-col items-center gap-1.5">
      {isUploading ? (
        <>
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          {/* El porcentaje, no una barra: en una caja de 104px una barra son
              cuatro píxeles de alto que no se ven moverse. */}
          <span className="tabular text-xs font-medium">{Math.round(progress * 100)} %</span>
        </>
      ) : isAlone ? (
        <>
          {/*
            El texto dice QUÉ va aquí, no solo cómo ponerlo.

            Decía "Arrastrar un archivo aquí": con un rótulo de sección encima
            que ponía "Soporte", eso bastaba. Sin el rótulo, "un archivo" no
            dice de qué archivo se trata, y este cuadro es el único sitio de la
            ficha donde se adjunta el recibo.
          */}
          <Upload className="size-6" aria-hidden="true" />
          <span className="text-center text-sm font-medium text-foreground">
            {t('transactions.supports.dropTitle')}
          </span>
          <span className="text-center text-xs">{t('transactions.supports.dropHelp')}</span>
          <span className="mt-1 flex items-center gap-1.5 text-center text-2xs text-muted-foreground">
            <FileText className="size-3.5 shrink-0" aria-hidden="true" />
            {t('transactions.supports.formats')}
          </span>
        </>
      ) : (
        <>
          <ImagePlus className="size-6" aria-hidden="true" />
          <span className="px-2 text-center text-2xs leading-tight">
            {t('transactions.supports.addOne')}
          </span>
        </>
      )}
    </div>
  );
}
