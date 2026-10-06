import { useState } from 'react';

import type { ProgresoDeLectura } from '@/features/transactions/api/leer-soporte';
import {
  hoyEnBogota,
  initialAmountAndDate,
  type CandidatoDelRecibo,
} from '@/features/transactions/model/movement-form';
import {
  SIN_CLASIFICAR,
  aplicar,
  type Clasificacion,
  type Origen,
} from '@/features/transactions/model/precedencia';
import {
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';
import { useAlCambiar } from '@/shared/lib/al-cambiar';
import type { Reading } from '@coco/receipt-parser';

/** Con qué se abre la ficha. Cambiar cualquiera de estos la vuelve a llenar. */
export interface SheetOpening {
  abierta: boolean;
  movimiento?: Transaction | null | undefined;
  pago?: PendingPayment | null | undefined;
  tipoPorDefecto: TransactionType;
}

/** Lo que se escribe en la ficha: los datos del movimiento y su clasificación. */
function useMovementFields(apertura: SheetOpening, descartes: number) {
  const { abierta, movimiento, pago, tipoPorDefecto } = apertura;
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(hoyEnBogota);
  const [type, setType] = useState<TransactionType>('expense');
  /*
    ── La clasificación lleva escrito de dónde salió ───────────────────────
    No es un id suelto: es un id y una fuente —a mano, el historial, las
    palabras clave, el diccionario—. Toda propuesta pasa por `aplicar()`, que
    es la única que sabe quién puede reemplazar a quién: lo elegido a mano no
    lo toca nada automático, y una fuente inferior nunca pisa a una superior.
    Ver `model/precedencia.ts`.

    Un solo objeto y actualizaciones funcionales, a propósito: las propuestas
    llegan por caminos asíncronos —la lectura de un recibo, una petición— y
    comparar contra un `categoryId` capturado en un render viejo es cómo una
    sugerencia tardía pisa lo que la persona acaba de elegir.
  */
  const [clasificacion, setClasificacion] = useState<Clasificacion>(SIN_CLASIFICAR);
  /**
   * Si en esta apertura alguna fuente automática propuso algo. Es lo que
   * decide si al guardar se aprende: solo cuando hubo una sugerencia que la
   * persona aceptó o corrigió, nunca de un movimiento clasificado a mano sin
   * que nadie hubiera dicho nada.
   */
  const [huboSugerencia, setHuboSugerencia] = useState(false);
  /** Lo que la lectura de un recibo dejó entre lo que dudar. */
  const [candidatosDelRecibo, setCandidatosDelRecibo] = useState<CandidatoDelRecibo[]>([]);
  /** El texto del que salió la lectura, para guardarlo con el movimiento. */
  const [textoLeido, setTextoLeido] = useState('');
  const [notes, setNotes] = useState('');

  // Cada vez que se abre se recarga desde el movimiento: sin esto, abrir para
  // editar el segundo movimiento mostraría los datos del primero.
  //
  // Durante el render y no en un efecto —ver `useAlCambiar`—: así la ficha
  // sale pintada ya con los datos buenos, sin un fotograma con los del
  // movimiento anterior.
  useAlCambiar([abierta, movimiento, pago, tipoPorDefecto, descartes], () => {
    if (!abierta) return;
    const iniciales = initialAmountAndDate(movimiento, pago);
    setDescription(movimiento?.description ?? '');
    setAmount(iniciales.amount);
    setDate(iniciales.date);
    setType(movimiento?.type ?? tipoPorDefecto);
    // Lo que llega puesto —el concepto de un movimiento que se edita, el de un
    // pago pendiente que se confirma— es una elección: lo automático no lo toca.
    const puesto = movimiento?.categoryId ?? pago?.categoryId;
    setClasificacion(
      puesto === undefined ? SIN_CLASIFICAR : { categoryId: puesto, origen: 'manual' },
    );
    setHuboSugerencia(false);
    setCandidatosDelRecibo([]);
    setTextoLeido('');
    setNotes(movimiento?.notes ?? '');
  });

  return {
    description,
    setDescription,
    amount,
    setAmount,
    date,
    setDate,
    type,
    clasificacion,
    categoryId: clasificacion.categoryId,
    proponer: (propuesta: { categoryId: number | undefined; origen: Origen }): void =>
      setClasificacion((previa) => aplicar(previa, propuesta)),
    huboSugerencia,
    setHuboSugerencia,
    candidatosDelRecibo,
    setCandidatosDelRecibo,
    textoLeido,
    setTextoLeido,
    notes,
    setNotes,
  };
}

/** En qué punto está la ficha: qué se enseña, qué se está haciendo, qué falló. */
function useSheetStatus(apertura: SheetOpening, descartes: number) {
  const { abierta, movimiento, pago, tipoPorDefecto } = apertura;
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  /**
   * La cascada de siempre, detrás de un enlace. Sigue existiendo para quien
   * quiera ir nivel a nivel, pero ya no es la puerta: la puerta es el buscador.
   */
  const [cascadaVisible, setCascadaVisible] = useState(false);
  /*
    ── Se abre para LEER, no para editar ────────────────────────────────────
    Abrir un movimiento es casi siempre consultarlo: ver cuánto fue, cuándo se
    pagó, mirar el recibo. Con todo editable desde el primer instante, cada
    una de esas consultas es una ocasión de cambiar algo sin querer —un clic
    en un desplegable, una tecla en el campo del valor— y de esos accidentes
    no queda rastro.

    Crear es lo contrario: no hay nada que leer, así que nace editable.
  */
  const [editable, setEditable] = useState(false);
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
  const [paso, setPaso] = useState<'camara' | 'leyendo' | 'formulario'>('formulario');

  useAlCambiar([abierta, movimiento, pago, tipoPorDefecto, descartes], () => {
    if (!abierta) return;
    setCascadaVisible(false);
    setError(null);
    setConfirmandoBorrado(false);
    setEditable(!movimiento);
    // Always the form: a sheet left on the camera or mid-reading would reopen
    // there for the next movement.
    setPaso('formulario');
  });

  return {
    error,
    setError,
    confirmandoBorrado,
    setConfirmandoBorrado,
    cascadaVisible,
    setCascadaVisible,
    editable,
    setEditable,
    paso,
    setPaso,
  };
}

/** La lectura de un soporte y los archivos que esperan a que exista el movimiento. */
function useSheetSupports(apertura: SheetOpening, descartes: number) {
  const { abierta, movimiento, pago, tipoPorDefecto } = apertura;
  const [progresoDeLectura, setProgresoDeLectura] = useState<ProgresoDeLectura | null>(null);
  const [lectura, setLectura] = useState<Reading | null>(null);
  /**
   * Lo que NO se pudo leer, para decirlo.
   *
   * Es un estado aparte del error porque no es un error: el archivo se abrió,
   * se miró y no se reconoció nada dentro. Un rojo ahí diría que algo salió
   * mal, y lo que hay que hacer es distinto —escribir los datos a mano—.
   */
  const [sinLeer, setSinLeer] = useState<string | null>(null);
  /*
    Los soportes elegidos antes de que el movimiento exista.

    Un soporte cuelga de un movimiento, y al crear todavía no hay de qué
    colgarlo. Se quedan aquí y se suben justo después de guardar: el orden
    inverso —crear el movimiento para poder adjuntar— obligaría a guardar algo
    a medias solo para tener un identificador.
  */
  const [pendientes, setPendientes] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  /**
   * El movimiento que se acaba de crear, cuando su soporte se quedó sin subir.
   *
   * Es lo que impide que reintentar cree un segundo movimiento por la misma
   * plata. Ver el porqué largo en `useGuardarMovimiento`.
   */
  const [registrado, setRegistrado] = useState<number | null>(null);

  useAlCambiar([abierta, movimiento, pago, tipoPorDefecto, descartes], () => {
    if (!abierta) return;
    setLectura(null);
    setSinLeer(null);
    setPendientes([]);
    setProgresoDeLectura(null);
    setRegistrado(null);
  });

  return {
    progresoDeLectura,
    setProgresoDeLectura,
    lectura,
    setLectura,
    sinLeer,
    setSinLeer,
    pendientes,
    setPendientes,
    subiendo,
    setSubiendo,
    registrado,
    setRegistrado,
  };
}

/**
 * Todo el estado de la ficha de un movimiento.
 *
 * Son quince estados, y se recargan juntos cada vez que la ficha se abre o se
 * cancela una edición.
 */
export function useMovementForm(apertura: SheetOpening) {
  /*
    Sube cada vez que se cancela una edición.

    Está en la firma de lo que llena los campos, así que cancelar los devuelve
    a lo que hay GUARDADO. Sin esto, "Cancelar" solo apagaba el modo de
    edición y dejaba en pantalla lo que se había escrito: la ficha decía una
    cosa y la base otra, y el siguiente que pulsara el lápiz guardaba sin
    querer un cambio que alguien ya había descartado.
  */
  const [descartes, setDescartes] = useState(0);

  return {
    ...useMovementFields(apertura, descartes),
    ...useSheetStatus(apertura, descartes),
    ...useSheetSupports(apertura, descartes),
    descartar: (): void => setDescartes((n) => n + 1),
  };
}

export type MovementSheetState = ReturnType<typeof useMovementForm>;
