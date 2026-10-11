import type { SubmitEvent } from 'react';

import {
  useUpdateTransaction,
  useCreateTransaction,
  useDeleteTransaction,
} from '@/features/transactions/api/transactions';
import { ApiClientError, apiUpload } from '@/shared/api/api-client';
import { useCreateCategory } from '@/shared/api/categories';
import { categorizationLearn } from '@/shared/api/generated/categorization-v2/categorization-v2';
import { type Transaction } from '@/shared/api/generated/model';
import { getReceiptsUploadUrl } from '@/shared/api/generated/receipts-v2/receipts-v2';
import { t } from '@/shared/lib/i18n';
import { shrinkReceipts } from '@/shared/lib/shrink-receipt';

import type { TransactionSheetState } from './use-transaction-form';

/** What is sent to the server, taken from what was typed. */
function transactionPayload(sheet: TransactionSheetState) {
  return {
    date: sheet.date,
    amount: sheet.amount.replace(',', '.'),
    type: sheet.type,
    description: sheet.description.trim() || null,
    // The merchant follows the description: it is what feeds the
    // automatic categorization of future imports.
    merchant: sheet.description.trim() || null,
    notes: sheet.notes.trim() || null,
    categoryId: sheet.categoryId ?? null,
    // Where it came in from, and the text it came from if there was a receipt: it is what
    // lets you know later why it was classified that way, and reinterpret it.
    source: 'web' as const,
    rawText: sheet.textRead.trim() || null,
  };
}

/** The receipts, now with a transaction to hang from. */
async function uploadPending(id: number, pending: File[]): Promise<void> {
  const data = new FormData();
  // See `shared/lib/shrink-receipt.ts`: what is uploaded is a light JPG, not the
  // twelve-megapixel photo a phone gives.
  for (const file of await shrinkReceipts(pending)) {
    data.append('files', file);
  }
  await apiUpload(getReceiptsUploadUrl(id), data);
}

/**
 * ── Learn, only if there was a suggestion ───────────────────────────────────
 * If any automatic source proposed something and the transaction was saved
 * classified, what was left —accepted or corrected— is a rule worth
 * remembering. A transaction classified by hand without anyone having
 * suggested anything does not go through here: there is nothing to confirm.
 *
 * Without waiting and without failing: learning is a bonus, and a rule that could not be
 * saved cannot turn a properly recorded expense into an error. From
 * empty or generic descriptions the server does not learn; it decides that, since it
 * is the one that has the list.
 */
function learnFromSuggestion(body: ReturnType<typeof transactionPayload>): void {
  if (body.categoryId === null || !body.description) return;
  void categorizationLearn({
    description: body.description,
    categoryId: body.categoryId,
  }).catch(() => undefined);
}

/**
 * Creates a category or a concept inside what is already picked, and picks it.
 *
 * ── Why here and not in Centros de costos ───────────────────────────────────
 * Because the moment you discover something does not exist is exactly the
 * moment you are looking for it. Sending you to another screen —and back, and
 * searching again— is where the task gets abandoned and the transaction ends up
 * unclassified.
 *
 * ── Why it does not apply to cost centers ───────────────────────────────────
 * Because a center is the top structure and it is defined three times in the
 * life of an account. Being able to make one up on the fly while recording an
 * expense is how accounts end up with "Casa", "casa" and "Hogar" being the
 * same. Its combo does not offer creating, and this is not called from there.
 */
export function useCreateInside(sheet: TransactionSheetState) {
  const createCategory = useCreateCategory();

  async function createInside(name: string, parentId: number | undefined): Promise<void> {
    if (name.trim() === '' || parentId === undefined) return;
    sheet.setError(null);

    try {
      const created = await createCategory.mutateAsync({
        name: name.trim(),
        kind: 'expense',
        parentId,
      });
      sheet.propose({ categoryId: created.id, origin: 'manual' });
    } catch (e) {
      sheet.setError(
        e instanceof ApiClientError ? e.message : t('transactions.sheet.createFailed'),
      );
    }
  }

  return { createInside, isCreating: createCategory.isPending };
}

/** Undoes what THIS attempt created, because its receipt did not arrive. */
async function undoCreation(
  remove: ReturnType<typeof useDeleteTransaction>,
  sheet: TransactionSheetState,
  id: number,
  message: string,
): Promise<void> {
  try {
    await remove.mutateAsync(id);
    sheet.setRegistered(null);
    sheet.setError(t('transactions.sheet.supportFailedUndone', { detail: message }));
  } catch {
    sheet.setRegistered(id);
    sheet.setError(t('transactions.sheet.supportFailedKept', { detail: message }));
  }
}

/**
 * Saving the sheet: create or update, and upload its receipts.
 *
 * ── Saving is TWO requests, and either both go in or neither does ───────────
 * First the transaction is created and then its receipts are uploaded, because a
 * receipt hangs from a transaction and until it exists there is nothing to
 * hang it from. That second request can fail on its own: the server runs out of
 * resources to process the image, the connection drops halfway through a photo, the
 * file is a format that cannot be opened over there.
 *
 * When that happens on a transaction that was just created, it is UNDONE: what
 * had just been recorded is deleted and it is said that nothing was left. An expense whose
 * receipt did not arrive is worse than no expense —money is noted down without the paper
 * that explains it, and nothing on screen recalls it is missing—, so the sheet
 * goes back to the state it came from and is retried whole.
 *
 * Before, it stayed recorded and a warning was shown. The reason was good —pressing
 * «Registrar» again created a SECOND transaction for the same money— but
 * the solution was worse than the problem: to avoid duplicating, things had to be left
 * half done. Undoing, there is nothing to duplicate, and the retry is the same
 * path as the first time.
 *
 * ── And if the undo ALSO fails ──────────────────────────────────────────────
 * Then it did stay recorded, and that has to be said. There the id is remembered: the
 * next attempt UPDATES that transaction instead of creating another.
 */
export function useSaveTransaction(
  sheet: TransactionSheetState,
  transaction: Transaction | null | undefined,
  onClose: () => void,
) {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    sheet.setError(null);
    const body = transactionPayload(sheet);
    const existing = transaction?.id ?? sheet.registered;
    let id = existing ?? undefined;
    /** THIS attempt created it. It is the only thing that can be undone without asking. */
    let wasJustCreated = false;

    try {
      if (existing != null) await update.mutateAsync({ id: existing, changes: body });
      else {
        const created = await create.mutateAsync(body);
        id = (created as { id: number }).id;
        wasJustCreated = true;
      }

      if (id !== undefined && sheet.pending.length > 0) {
        sheet.setIsUploading(true);
        await uploadPending(id, sheet.pending);
      }
      if (sheet.wasSuggested) learnFromSuggestion(body);
      onClose();
    } catch (e) {
      const message = e instanceof ApiClientError ? e.message : t('centers.saveFailed');
      // Editing, or retrying on one that already existed: there is nothing here to
      // undo. What was there before is still there, which is correct.
      if (!wasJustCreated || id === undefined) sheet.setError(message);
      else await undoCreation(remove, sheet, id, message);
    } finally {
      sheet.setIsUploading(false);
    }
  }

  return {
    onSubmit,
    isSaving: create.isPending || update.isPending || sheet.isUploading,
    remove,
  };
}
