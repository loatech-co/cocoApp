import type { ReadingProgress } from '@/features/transactions/api/read-receipt';
import { t } from '@/shared/lib/i18n';
import { useObjectUrl } from '@/shared/lib/object-url';
import { cn } from '@/shared/lib/utils';
import { PdfCanvas } from '@/shared/ui/atoms/pdf-canvas';
import { Progress } from '@/shared/ui/atoms/progress';

/**
 * The document, with a band of light crossing it while it is read.
 *
 * ── Why the document is shown and not a spinner ────────────────────────────
 * Because a spinner says «wait» and nothing else: it is the same drawing for loading
 * a list, saving a form or reading a receipt. Here something
 * concrete is happening that can be shown —a machine is looking at THAT paper—, and
 * showing it does two things the spinner does not: you understand the wait has
 * a reason, and you see which document is being read, which is exactly the fact
 * needed if what comes out does not add up.
 *
 * The `blob:` lives exactly as long as this step: see `useObjectUrl`.
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
        The scanner glass: the document inside, clipped, and the two layers
        of the sweep on top. `overflow-hidden` is what keeps the band
        inside the frame, and `select-none` keeps a drag over it from
        selecting half the sheet.
      */}
      <div
        className={cn(
          'relative w-full max-w-sm select-none overflow-hidden rounded-lg',
          'border border-border bg-card',
          // A page is taller than it is wide. Fixing the aspect ratio, the frame does not
          // change size when the image finishes loading.
          'aspect-[3/4]',
        )}
      >
        {url === null ? null : isImage ? (
          // `object-top`: what you need to see of a receipt is at the top —the
          // merchant, the date—, not in its geometric center.
          <img src={url} alt="" className="size-full object-cover object-top opacity-80" />
        ) : (
          <div className="grid size-full place-items-center overflow-hidden">
            <PdfCanvas url={url} />
          </div>
        )}

        <ScanSweep />
      </div>

      <p className="text-sm font-medium">{stage}</p>

      {/* The OCR of a scan takes seconds and without a bar it looks hung. The
          bar is the shared one: this one measured 4px tall and 192 wide and the
          import's 8px and full width, while being the same wait for the same
          work. */}
      <Progress value={progress?.progress ?? 0} label={stage} className="w-full max-w-sm" />
    </div>
  );
}

/** The two layers of the sweep, on top of the document. */
function ScanSweep() {
  return (
    <>
      {/*
        The trail: what was already swept stays a bit lighter than what is left.
        Without this the band looks like a stray reflection passing over; with
        it, it looks like it leaves the finished work behind.
      */}
      <span
        aria-hidden="true"
        className="deja-rastro pointer-events-none absolute inset-0 bg-accent/25"
      />

      {/* The band, with its bright leading edge. */}
      <span
        aria-hidden="true"
        className={cn(
          'barre pointer-events-none absolute inset-y-0 left-0 w-1/4',
          'bg-gradient-to-r from-transparent via-accent-ink/30 to-transparent',
        )}
      >
        <span className="absolute inset-y-0 right-0 w-px bg-accent-ink shadow-[0_0_12px_2px_var(--accent-ink)]" />
      </span>
    </>
  );
}
