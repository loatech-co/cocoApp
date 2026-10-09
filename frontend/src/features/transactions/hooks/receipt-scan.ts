import { readReceipt } from '@/features/transactions/api/read-receipt';
import { unreadNotice, proposalFromReading } from '@/features/transactions/model/transaction-form';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';

import type { TransactionSheetState } from './use-transaction-form';

/**
 * The minimum length of the reading step of a receipt.
 *
 * ── Why it waits on purpose ─────────────────────────────────────────────────
 * Because reading does not always take the same: a PDF with its text inside is
 * resolved in half a second and a photo goes through OCR and takes ten. With the
 * wait tied to the work, the same action gave two different results —a
 * flicker or a long wait— and the flicker is the worse of the two: the band
 * does not manage to cross the document, the bar jumps from 0 to nothing, and what is
 * seen is a jitter between two screens that leaves it unclear whether anything
 * was read. With a floor, reading a receipt always looks the same.
 *
 * ── Why four seconds ────────────────────────────────────────────────────────
 * The band crosses in 1.8s (`barrer`, in `index.css`). Four seconds are two
 * full passes and a breather: you see the whole sweep, you see it start
 * over —which is what says «still working»— and there is time to read which
 * document it is, which is the fact needed if what comes out does not add up.
 *
 * And it is a MINIMUM, not a pause that adds up: if the reading takes longer, there is
 * no wait.
 */
const MIN_READING_MS = 4000;

/** Waits whatever is left for the reading to have lasted `MIN_READING_MS`. */
async function waitForReadingFloor(startedAt: number): Promise<void> {
  const remaining = MIN_READING_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise<void>((resume) => {
      setTimeout(resume, remaining);
    });
  }
}

/**
 * Reads the receipt and fills in what it knows.
 *
 * It fills in, it does not decide: what was read goes into the same fields that would be typed by
 * hand, and the person confirms with the usual button. A badly read
 * receipt that saves itself is worse than not reading it, because nobody looks again at
 * what was already recorded.
 */
export function makeReceiptScan(sheet: TransactionSheetState, tree: Category[] | undefined) {
  return async function scan(file: File): Promise<void> {
    sheet.setStep('leyendo');
    sheet.setError(null);
    sheet.setPending([file]);
    const startedAt = Date.now();

    try {
      const { reading, text } = await readReceipt(file, {
        period: sheet.date.slice(0, 7),
        // The tree and the keywords no longer travel: the server has them,
        // and it is the one interpreting now.
        onProgress: sheet.setReadingProgress,
      });
      // It is saved with the transaction: it is the only way to know later
      // why it was classified the way it was, and to reinterpret it.
      sheet.setTextRead(text);

      const notice = unreadNotice(reading, text);
      sheet.setReading(notice === null ? reading : null);
      sheet.setUnreadNotice(notice);

      if (reading.value !== null) sheet.setAmount(String(reading.value));
      if (reading.date) sheet.setDate(reading.date);
      if (reading.concept) sheet.setDescription(reading.concept);

      // Goes through `propose`: if something was already picked by hand, nothing is touched.
      const proposal = proposalFromReading(reading, tree ?? []);
      if (proposal) {
        sheet.setWasSuggested(true);
        const { categoryId, origin, candidates } = proposal;
        if (categoryId !== undefined) sheet.propose({ categoryId, origin });
        if (candidates) sheet.setReceiptCandidates(candidates);
      }
    } catch (e) {
      sheet.setError(e instanceof Error ? e.message : t('transactions.reading.fileReadFailed'));
    } finally {
      // The floor of the wait, whether it goes well or badly. Also when it fails: an
      // error message that appears in a flash reads as a failure of
      // the sheet and not as the result of having tried to read the file.
      await waitForReadingFloor(startedAt);
      sheet.setReadingProgress(null);
      sheet.setStep('formulario');
    }
  };
}
