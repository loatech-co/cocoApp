import { useState } from 'react';

import type { ReadingProgress } from '@/features/transactions/api/read-receipt';
import {
  todayInBogota,
  initialAmountAndDate,
  type ReceiptCandidate,
} from '@/features/transactions/model/movement-form';
import {
  UNCLASSIFIED,
  apply,
  type Classification,
  type Origin,
} from '@/features/transactions/model/precedence';
import {
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';
import { useOnChange } from '@/shared/lib/on-change';
import type { Reading } from '@coco/receipt-parser';

/** Con qué se abre la ficha. Cambiar cualquiera de estos la vuelve a llenar. */
export interface SheetOpening {
  isOpen: boolean;
  transaction?: Transaction | null | undefined;
  payment?: PendingPayment | null | undefined;
  defaultType: TransactionType;
}

/** Lo que se escribe en la ficha: los datos del movimiento y su clasificación. */
function useMovementFields(opening: SheetOpening, discards: number) {
  const { isOpen, transaction, payment, defaultType } = opening;
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayInBogota);
  const [type, setType] = useState<TransactionType>('expense');
  /*
    ── La clasificación lleva escrito de dónde salió ───────────────────────
    No es un id suelto: es un id y una fuente —a mano, el historial, las
    palabras clave, el diccionario—. Toda propuesta pasa por `aplicar()`, que
    es la única que sabe quién puede reemplazar a quién: lo elegido a mano no
    lo toca nada automático, y una fuente inferior nunca pisa a una superior.
    Ver `model/precedence.ts`.

    Un solo objeto y actualizaciones funcionales, a propósito: las propuestas
    llegan por caminos asíncronos —la lectura de un recibo, una petición— y
    comparar contra un `categoryId` capturado en un render viejo es cómo una
    sugerencia tardía pisa lo que la persona acaba de elegir.
  */
  const [classification, setClassification] = useState<Classification>(UNCLASSIFIED);
  /**
   * Si en esta apertura alguna fuente automática propuso algo. Es lo que
   * decide si al guardar se aprende: solo cuando hubo una sugerencia que la
   * persona aceptó o corrigió, nunca de un movimiento clasificado a mano sin
   * que nadie hubiera dicho nada.
   */
  const [wasSuggested, setWasSuggested] = useState(false);
  /** Lo que la lectura de un recibo dejó entre lo que dudar. */
  const [receiptCandidates, setReceiptCandidates] = useState<ReceiptCandidate[]>([]);
  /** El texto del que salió la lectura, para guardarlo con el movimiento. */
  const [textRead, setTextRead] = useState('');
  const [notes, setNotes] = useState('');

  // Cada vez que se abre se recarga desde el movimiento: sin esto, abrir para
  // editar el segundo movimiento mostraría los datos del primero.
  //
  // Durante el render y no en un efecto —ver `useAlCambiar`—: así la ficha
  // sale pintada ya con los datos buenos, sin un fotograma con los del
  // movimiento anterior.
  useOnChange([isOpen, transaction, payment, defaultType, discards], () => {
    if (!isOpen) return;
    const initials = initialAmountAndDate(transaction, payment);
    setDescription(transaction?.description ?? '');
    setAmount(initials.amount);
    setDate(initials.date);
    setType(transaction?.type ?? defaultType);
    // Lo que llega puesto —el concepto de un movimiento que se edita, el de un
    // pago pendiente que se confirma— es una elección: lo automático no lo toca.
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

/** En qué punto está la ficha: qué se enseña, qué se está haciendo, qué falló. */
function useSheetStatus(opening: SheetOpening, discards: number) {
  const { isOpen, transaction, payment, defaultType } = opening;
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingDeletion, setIsConfirmingDeletion] = useState(false);
  /**
   * La cascada de siempre, detrás de un enlace. Sigue existiendo para quien
   * quiera ir nivel a nivel, pero ya no es la puerta: la puerta es el buscador.
   */
  const [isCascadeVisible, setIsCascadeVisible] = useState(false);
  /*
    ── Se abre para LEER, no para editar ────────────────────────────────────
    Abrir un movimiento es casi siempre consultarlo: ver cuánto fue, cuándo se
    pagó, mirar el recibo. Con todo editable desde el primer instante, cada
    una de esas consultas es una ocasión de cambiar algo sin querer —un clic
    en un desplegable, una tecla en el campo del valor— y de esos accidentes
    no queda rastro.

    Crear es lo contrario: no hay nada que leer, así que nace editable.
  */
  const [isEditable, setEditable] = useState(false);
  /*
    ── The form is the first thing you see ──────────────────────────────────
    A new movement used to open on a chooser —"Registrar manualmente",
    "Subir un archivo", "Tomar una foto"— before the form. It cost one click
    on every new movement to answer a question most people answered the same
    way, and it hid the form behind a screen that had nothing to fill in.

    Now the form opens directly. Uploading a file and taking a photo are two
    actions inside the document column (`SoportesPendientes`); the camera and
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
    // there for the next movement.
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

/** La lectura de un soporte y los archivos que esperan a que exista el movimiento. */
function useSheetSupports(opening: SheetOpening, discards: number) {
  const { isOpen, transaction, payment, defaultType } = opening;
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  /**
   * Lo que NO se pudo leer, para decirlo.
   *
   * Es un estado aparte del error porque no es un error: el archivo se abrió,
   * se miró y no se reconoció nada dentro. Un rojo ahí diría que algo salió
   * mal, y lo que hay que hacer es distinto —escribir los datos a mano—.
   */
  const [unreadNotice, setUnreadNotice] = useState<string | null>(null);
  /*
    Los soportes elegidos antes de que el movimiento exista.

    Un soporte cuelga de un movimiento, y al crear todavía no hay de qué
    colgarlo. Se quedan aquí y se suben justo después de guardar: el orden
    inverso —crear el movimiento para poder adjuntar— obligaría a guardar algo
    a medias solo para tener un identificador.
  */
  const [pending, setPending] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  /**
   * El movimiento que se acaba de crear, cuando su soporte se quedó sin subir.
   *
   * Es lo que impide que reintentar cree un segundo movimiento por la misma
   * plata. Ver el porqué largo en `useGuardarMovimiento`.
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
 * Todo el estado de la ficha de un movimiento.
 *
 * Son quince estados, y se recargan juntos cada vez que la ficha se abre o se
 * cancela una edición.
 */
export function useMovementForm(opening: SheetOpening) {
  /*
    Sube cada vez que se cancela una edición.

    Está en la firma de lo que llena los campos, así que cancelar los devuelve
    a lo que hay GUARDADO. Sin esto, "Cancelar" solo apagaba el modo de
    edición y dejaba en pantalla lo que se había escrito: la ficha decía una
    cosa y la base otra, y el siguiente que pulsara el lápiz guardaba sin
    querer un cambio que alguien ya había descartado.
  */
  const [discards, setDiscards] = useState(0);

  return {
    ...useMovementFields(opening, discards),
    ...useSheetStatus(opening, discards),
    ...useSheetSupports(opening, discards),
    discard: (): void => setDiscards((n) => n + 1),
  };
}

export type MovementSheetState = ReturnType<typeof useMovementForm>;
