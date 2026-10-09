import { ClipboardPaste, FileText, ImagePlus, Loader2, Upload } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';

import { usePasteScreenshot } from '@/features/transactions/hooks/use-paste-screenshot';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { DropSurface } from '@/shared/ui/atoms/drop-surface';
import { FilePicker } from '@/shared/ui/atoms/file-picker';

/** Dropping files on top: it is marked while they pass over and they are handed over on drop. */
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
  /** With no receipt yet: it takes the width and explains. */
  isAlone: boolean;
  /**
   * What the small tile does when pressed, if not opening the file picker.
   *
   * The gallery uses it to lead to the big box instead of to the system's
   * file picker: in 104px there is no room for the explanation of what is accepted nor the paste
   * button, so the tile became a DOOR and the big box the
   * place where things are really added.
   */
  onPress?: () => void;
  onFiles: (files: File[]) => void;
}

/**
 * The slot where receipts are dropped.
 *
 * ── Why it is a dashed box and not a button ─────────────────────────────────
 * Because it takes a place in the same row as the thumbnails and of the same
 * size: it reads as the spot for the next receipt, not as an action somewhere
 * else in the sheet. And the dashed border is what everywhere means
 * "something that is not here yet fits here" —a solid button would say the opposite,
 * that there is already a thing there—.
 *
 * ── Why it also accepts things dropped on it ────────────────────────────────
 * Because the receipt almost always comes from another window: the email, the
 * downloads folder. Forcing a trip through the file dialog is asking
 * to look up by hand what you are already holding.
 *
 * ── A BOX, not a button ─────────────────────────────────────────────────────
 * It was a whole `<button>`, and that is why the paste button had to live outside,
 * below: a button inside another is not valid HTML. But pasting is one of
 * the three ways to give a file —drag it, pick it, paste it— and putting it
 * outside left it looking like something else, hanging from the box instead of being
 * part of it.
 *
 * So the box is a box, and what opens the file picker is a
 * button that covers it entirely beneath the content. The visible result
 * is the same —you press anywhere on the box and the picker opens— and
 * on top of it whatever is needed fits inside.
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

        {/* The third way to give a file, inside the box and with the
            other two: set apart, it read as something else hanging below.

            `relative` to sit above the button that covers the box, or the
            click would go to it. */}
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

/** The paste button and, if the clipboard would not let itself be read, why. */
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

/** What is read inside the box: the progress, the explanation or the short label. */
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
          {/* The percentage, not a bar: in a 104px box a bar is
              four pixels tall that cannot be seen moving. */}
          <span className="tabular text-xs font-medium">{Math.round(progress * 100)} %</span>
        </>
      ) : isAlone ? (
        <>
          {/*
            The text says WHAT goes here, not just how to put it.

            It said "Arrastrar un archivo aquí": with a section label above
            that said "Soporte", that was enough. Without the label, "un archivo" does not
            say which file it is about, and this box is the only place in the
            sheet where the receipt is attached.
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
