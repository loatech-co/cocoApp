import { Loader2 } from 'lucide-react';
import type { ComponentProps, SubmitEvent } from 'react';

import type { TransactionSheetState } from '@/features/transactions/hooks/use-transaction-form';
import { transactionName, selectedPath } from '@/features/transactions/model/transactions';
import { type Transaction } from '@/shared/api/generated/model';
import { DEFAULT_CURRENCY } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';

import { PendingReceipts } from './pending-receipts';
import { Receipts } from './receipts';
import { TransactionFields } from './transaction-fields';
import { TransactionReadColumn } from './transaction-read-view';

/**
 * THE grid of a transaction sheet: the paper and what it says.
 *
 * ── Why a class and not two written grids ───────────────────────────────────
 * Because the sheet has five faces —read, edit, record by hand, record
 * with a file and, soon, with a photo— and all five are the same: a
 * document on the left and its data on the right. Written in each one, the
 * read one and the edit one had already drifted apart: on pressing «Editar», the receipt
 * jumped places and the columns changed width in the same gesture.
 *
 * ── The split: half and half ────────────────────────────────────────────────
 * Favoring the paper was tried —65 and 35— and it was not needed. Since the
 * document column lost its row of thumbnails, what is in it is a single
 * 350px-tall preview: giving it two thirds of the width only leaves it
 * with air on the sides while the fields next to it get squeezed.
 *
 * Below `lg` there is no split: they are two stacked rows, because on a
 * phone two 170px columns are not two columns.
 */
const SHEET_GRID = 'grid gap-5 lg:min-h-0 lg:flex-1 lg:auto-rows-fr lg:grid-cols-2';

type FieldsProps = ComponentProps<typeof TransactionFields>;

type SheetFormProps = FieldsProps & {
  transaction: Transaction | null | undefined;
  scan: (file: File) => Promise<void>;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  isSaving: boolean;
  onCancel: () => void;
};

/**
 * The sheet's form: the receipt on the left, the data on the right
 * —to read or to edit— and the footer.
 */
export function TransactionSheetForm({
  transaction,
  scan,
  onSubmit,
  isSaving,
  onCancel,
  ...fields
}: SheetFormProps) {
  const { sheet } = fields;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col gap-4">
      {/*
        ── The same grid, whether reading or editing ────────────────────────
        And the SAME one in the tree, not a copy in each branch: the paper column
        is drawn once, outside the conditional, so on pressing «Editar»
        React does not unmount it. Written inside both branches, the receipt was
        downloaded again on every switch —the frame emptied, the spinner
        appeared and the same image came back that was already in the tab's
        memory—.

        The only thing that changes from side to side is the right column: the fields or
        what they say.
      */}
      <div className={SHEET_GRID}>
        <div className="flex flex-col">
          {transaction ? (
            <Receipts transactionId={transaction.id} />
          ) : (
            <PendingReceiptsColumn sheet={sheet} scan={scan} />
          )}
        </div>

        {sheet.isEditable ? (
          <TransactionFields {...fields} />
        ) : (
          <ReadColumn sheet={sheet} transaction={transaction} tree={fields.tree} />
        )}
      </div>

      {sheet.error && (
        <p role="alert" className="text-sm text-destructive">
          {sheet.error}
        </p>
      )}

      {/* While reading there is no footer: there is nothing to cancel or save, and to
          leave there is already the X in the corner. A "Cerrar" button under
          everything is a second door to the same exit. */}
      {sheet.isEditable && (
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {transaction ? t('common.save') : t('transactions.sheet.register')}
          </Button>
        </ModalFooter>
      )}
    </form>
  );
}

/**
 * The receipts of a transaction that does not exist yet.
 *
 * The FIRST document of a new transaction is read. Whether it came from the drop
 * zone, the paste button, "Cargar archivo" or the camera: the receipt is what
 * turns the expected (or empty) value and date into the real ones. Attaching
 * it and having nothing happen left the document as decoration and forced
 * typing what the app can read.
 *
 * Only the first, and only when there is none yet: the rest stay attached
 * unread, because what fills the form is ONE document. What was read shows up
 * as a notice to verify, not as a saved fact.
 */
function PendingReceiptsColumn({
  sheet,
  scan,
}: {
  sheet: TransactionSheetState;
  scan: (file: File) => Promise<void>;
}) {
  return (
    <PendingReceipts
      files={sheet.pending}
      onAdd={(added) => {
        const [first, ...rest] = added;

        if (sheet.pending.length === 0 && first) {
          void scan(first).then(() => {
            if (rest.length > 0) sheet.setPending((p) => [...p, ...rest]);
          });
          return;
        }

        sheet.setPending((p) => [...p, ...added]);
      }}
      onRemove={(i) => sheet.setPending((p) => p.filter((_, n) => n !== i))}
      onTakePhoto={() => sheet.setStep('camara')}
    />
  );
}

/** The data column, only for looking. */
function ReadColumn({
  sheet,
  transaction,
  tree,
}: {
  sheet: TransactionSheetState;
  transaction: Transaction | null | undefined;
  tree: FieldsProps['tree'];
}) {
  const { costCenter, category, concept } = selectedPath(tree, sheet.categoryId);

  return (
    <TransactionReadColumn
      type={sheet.type}
      // The name comes from the concept, same as in the table. It read `description`,
      // which on a transaction recorded by hand has been empty since the sheet
      // swapped its free-text field for a selector.
      name={transaction ? transactionName(transaction, tree) : ''}
      value={sheet.amount}
      currency={transaction?.currency ?? DEFAULT_CURRENCY}
      date={sheet.date}
      period={transaction?.period}
      path={[costCenter?.name, category?.name, concept?.name].filter(Boolean) as string[]}
      notes={sheet.notes}
    />
  );
}
