import { useState } from 'react';

import type { ReadingProgress } from '@/features/transactions/api/read-receipt';
import {
  UNCLASSIFIED,
  apply,
  type Classification,
  type Origin,
} from '@/features/transactions/model/precedence';
import {
  todayInBogota,
  initialAmountAndDate,
  type ReceiptCandidate,
} from '@/features/transactions/model/transaction-form';
import {
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';
import { useOnChange } from '@/shared/lib/on-change';
import type { Reading } from '@coco/receipt-parser';

/** What the sheet opens with. Changing any of these fills it again. */
export interface SheetOpening {
  isOpen: boolean;
  transaction?: Transaction | null | undefined;
  payment?: PendingPayment | null | undefined;
  defaultType: TransactionType;
}

/** What is typed in the sheet: the transaction's data and its classification. */
function useTransactionFields(opening: SheetOpening, discards: number) {
  const { isOpen, transaction, payment, defaultType } = opening;
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayInBogota);
  const [type, setType] = useState<TransactionType>('expense');
  /*
    ── The classification carries where it came from ──────────────────────
    It is not a loose id: it is an id and a source —by hand, the history, the
    keywords, the dictionary—. Every proposal goes through `apply()`, which
    is the only one that knows who can replace whom: nothing automatic touches what was
    picked by hand, and a lower source never overrides a higher one.
    See `model/precedence.ts`.

    A single object and functional updates, on purpose: proposals
    arrive through async paths —reading a receipt, a request— and
    comparing against a `categoryId` captured in an old render is how a
    late suggestion overrides what the person just picked.
  */
  const [classification, setClassification] = useState<Classification>(UNCLASSIFIED);
  /**
   * Whether any automatic source proposed something in this opening. It is what
   * decides whether saving learns: only when there was a suggestion the
   * person accepted or corrected, never from a transaction classified by hand without
   * anyone having said anything.
   */
  const [wasSuggested, setWasSuggested] = useState(false);
  /** What reading a receipt left to choose between. */
  const [receiptCandidates, setReceiptCandidates] = useState<ReceiptCandidate[]>([]);
  /** The text the reading came from, to save it with the transaction. */
  const [textRead, setTextRead] = useState('');
  const [notes, setNotes] = useState('');

  // Every time it opens it reloads from the transaction: without this, opening to
  // edit the second transaction would show the data of the first.
  //
  // During render and not in an effect —see `useOnChange`—: that way the sheet
  // comes out already painted with the right data, without a frame with those of the
  // previous transaction.
  useOnChange([isOpen, transaction, payment, defaultType, discards], () => {
    if (!isOpen) return;
    const initials = initialAmountAndDate(transaction, payment);
    setDescription(transaction?.description ?? '');
    setAmount(initials.amount);
    setDate(initials.date);
    setType(transaction?.type ?? defaultType);
    // What arrives set —the concept of a transaction being edited, that of a
    // pending payment being confirmed— is a choice: nothing automatic touches it.
    const chosenId = transaction?.categoryId ?? payment?.categoryId;
    setClassification(
      chosenId === undefined ? UNCLASSIFIED : { categoryId: chosenId, origin: 'manual' },
    );
    setWasSuggested(false);
    setReceiptCandidates([]);
    setTextRead('');
    setNotes(transaction?.notes ?? '');
  });

  return {
    description,
    setDescription,
    amount,
    setAmount,
    date,
    setDate,
    type,
    classification,
    categoryId: classification.categoryId,
    propose: (proposal: { categoryId: number | undefined; origin: Origin }): void =>
      setClassification((preview) => apply(preview, proposal)),
    wasSuggested,
    setWasSuggested,
    receiptCandidates,
    setReceiptCandidates,
    textRead,
    setTextRead,
    notes,
    setNotes,
  };
}

/** Where the sheet is at: what is shown, what is being done, what failed. */
function useSheetStatus(opening: SheetOpening, discards: number) {
  const { isOpen, transaction, payment, defaultType } = opening;
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingDeletion, setIsConfirmingDeletion] = useState(false);
  /**
   * The usual cascade, behind a link. It still exists for whoever
   * wants to go level by level, but it is no longer the door: the door is the search.
   */
  const [isCascadeVisible, setIsCascadeVisible] = useState(false);
  /*
    ── It opens to READ, not to edit ────────────────────────────────────────
    Opening a transaction is almost always looking it up: seeing how much it was, when it was
    paid, looking at the receipt. With everything editable from the first instant, each
    of those lookups is a chance to change something by accident —a click
    on a dropdown, a key in the amount field— and those accidents
    leave no trace.

    Creating is the opposite: there is nothing to read, so it is born editable.
  */
  const [isEditable, setEditable] = useState(false);
  /*
    ── The form is the first thing you see ──────────────────────────────────
    A new transaction used to open on a chooser —"Registrar manualmente",
    "Subir un archivo", "Tomar una foto"— before the form. It cost one click
    on every new transaction to answer a question most people answered the same
    way, and it hid the form behind a screen that had nothing to fill in.

    Now the form opens directly. Uploading a file and taking a photo are two
    actions inside the document column (`PendingReceipts`); the camera and
    the reading step still take over the sheet while they last, and come back
    to the form when they finish.
  */
  const [step, setStep] = useState<'camara' | 'leyendo' | 'formulario'>('formulario');

  useOnChange([isOpen, transaction, payment, defaultType, discards], () => {
    if (!isOpen) return;
    setIsCascadeVisible(false);
    setError(null);
    setIsConfirmingDeletion(false);
    setEditable(!transaction);
    // Always the form: a sheet left on the camera or mid-reading would reopen
    // there for the next transaction.
    setStep('formulario');
  });

  return {
    error,
    setError,
    isConfirmingDeletion,
    setIsConfirmingDeletion,
    isCascadeVisible,
    setIsCascadeVisible,
    isEditable,
    setEditable,
    step,
    setStep,
  };
}

/** The reading of a receipt and the files waiting for the transaction to exist. */
function useSheetReceipts(opening: SheetOpening, discards: number) {
  const { isOpen, transaction, payment, defaultType } = opening;
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  /**
   * What could NOT be read, to say so.
   *
   * It is a state apart from the error because it is not an error: the file opened,
   * it was looked at and nothing was recognized inside. A red there would say something went
   * wrong, and what has to be done is different —typing the data by hand—.
   */
  const [unreadNotice, setUnreadNotice] = useState<string | null>(null);
  /*
    The receipts picked before the transaction exists.

    A receipt hangs from a transaction, and when creating there is nothing yet to
    hang it from. They stay here and are uploaded right after saving: the
    reverse order —creating the transaction to be able to attach— would force saving something
    half done just to have an identifier.
  */
  const [pending, setPending] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  /**
   * The transaction that was just created, when its receipt was left un-uploaded.
   *
   * It is what keeps a retry from creating a second transaction for the same
   * money. See the long why in `useSaveTransaction`.
   */
  const [registered, setRegistered] = useState<number | null>(null);

  useOnChange([isOpen, transaction, payment, defaultType, discards], () => {
    if (!isOpen) return;
    setReading(null);
    setUnreadNotice(null);
    setPending([]);
    setReadingProgress(null);
    setRegistered(null);
  });

  return {
    readingProgress,
    setReadingProgress,
    reading,
    setReading,
    unreadNotice,
    setUnreadNotice,
    pending,
    setPending,
    isUploading,
    setIsUploading,
    registered,
    setRegistered,
  };
}

/**
 * All the state of a transaction's sheet.
 *
 * It is fifteen states, and they reload together every time the sheet opens or an
 * edit is cancelled.
 */
export function useTransactionForm(opening: SheetOpening) {
  /*
    Goes up every time an edit is cancelled.

    It is in the signature of what fills the fields, so cancelling takes them back
    to what is SAVED. Without this, "Cancelar" only turned off edit
    mode and left on screen what had been typed: the sheet said one
    thing and the database another, and the next one to press the pencil saved without
    meaning to a change someone had already discarded.
  */
  const [discards, setDiscards] = useState(0);

  return {
    ...useTransactionFields(opening, discards),
    ...useSheetStatus(opening, discards),
    ...useSheetReceipts(opening, discards),
    discard: (): void => setDiscards((n) => n + 1),
  };
}

export type TransactionSheetState = ReturnType<typeof useTransactionForm>;
