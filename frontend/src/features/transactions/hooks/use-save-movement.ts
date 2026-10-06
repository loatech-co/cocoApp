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
import { getSoportesUploadUrl } from '@/shared/api/generated/soportes-v2/soportes-v2';
import { t } from '@/shared/lib/i18n';
import { shrinkReceipts } from '@/shared/lib/shrink-receipt';

import type { MovementSheetState } from './use-movement-form';

/** Lo que se manda al servidor, sacado de lo escrito. */
function movementPayload(sheet: MovementSheetState) {
  return {
    date: sheet.date,
    amount: sheet.amount.replace(',', '.'),
    type: sheet.type,
    description: sheet.description.trim() || null,
    // El comercio sigue a la descripción: es lo que alimenta la
    // categorización automática de futuras importaciones.
    merchant: sheet.description.trim() || null,
    notes: sheet.notes.trim() || null,
    categoryId: sheet.categoryId ?? null,
    // De dónde entró, y el texto del que salió si hubo recibo: es lo que
    // permite saber después por qué se clasificó así, y reinterpretarlo.
    source: 'web' as const,
    rawText: sheet.textRead.trim() || null,
  };
}

/** Los soportes, ya con un movimiento del que colgar. */
async function uploadPending(id: number, pending: File[]): Promise<void> {
  const data = new FormData();
  // Ver `shared/lib/encoger-soporte.ts`: lo que sube es un JPG liviano, no la
  // foto de doce megapíxeles que da un teléfono.
  for (const file of await shrinkReceipts(pending)) {
    data.append('files', file);
  }
  await apiUpload(getSoportesUploadUrl(id), data);
}

/**
 * ── Aprender, solo si hubo sugerencia ───────────────────────────────────────
 * Si alguna fuente automática propuso algo y el movimiento se guardó
 * clasificado, lo que quedó —aceptado o corregido— es una regla que vale la
 * pena recordar. Un movimiento clasificado a mano sin que nadie hubiera
 * sugerido nada no pasa por aquí: no hay nada que confirmar.
 *
 * Sin esperar y sin fallar: aprender es de regalo, y una regla que no se pudo
 * guardar no puede convertir un gasto bien registrado en un error. De
 * descripciones vacías o genéricas el servidor no aprende; lo decide él, que
 * es quien tiene la lista.
 */
function learnFromSuggestion(body: ReturnType<typeof movementPayload>): void {
  if (body.categoryId === null || !body.description) return;
  void categorizationLearn({
    description: body.description,
    categoryId: body.categoryId,
  }).catch(() => undefined);
}

/**
 * Crea una categoría o un concepto dentro de lo que ya está elegido, y lo elige.
 *
 * ── Por qué aquí y no en Centros de costos ──────────────────────────────────
 * Porque el momento en que uno descubre que algo no existe es exactamente el
 * momento en que lo está buscando. Mandarlo a otra pantalla —y a volver, y a
 * buscar otra vez— es donde se abandona la tarea y el movimiento acaba sin
 * clasificar.
 *
 * ── Por qué no vale para los centros de costos ──────────────────────────────
 * Porque un centro es la estructura de arriba y se define tres veces en la
 * vida de una cuenta. Poder inventar uno al vuelo mientras se registra un
 * gasto es como acaban las cuentas con "Casa", "casa" y "Hogar" siendo lo
 * mismo. Su combo no ofrece crear, y esto no se llama desde ahí.
 */
export function useCreateInside(sheet: MovementSheetState) {
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

/** Deshace lo que ESTE intento creó, porque su soporte no llegó. */
async function undoCreation(
  remove: ReturnType<typeof useDeleteTransaction>,
  sheet: MovementSheetState,
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
 * Guardar la ficha: crear o actualizar, y subir sus soportes.
 *
 * ── Guardar son DOS peticiones, y o entran las dos o no entra ninguna ───────
 * Primero se crea el movimiento y después se suben sus soportes, porque un
 * soporte cuelga de un movimiento y hasta que no existe no hay de qué
 * colgarlo. Esa segunda petición puede fallar sola: el servidor se queda sin
 * recursos para tratar la imagen, se cae la conexión a mitad de una foto, el
 * archivo es un formato que allá no se puede abrir.
 *
 * Cuando eso pasa en un movimiento que se acaba de crear, se DESHACE: se borra
 * lo que se acababa de registrar y se dice que no quedó nada. Un gasto cuyo
 * soporte no llegó es peor que ningún gasto —queda anotada plata sin el papel
 * que la explica, y nada en la pantalla recuerda que falta—, así que la ficha
 * vuelve al estado del que salió y se reintenta entera.
 *
 * Antes se quedaba registrado y se avisaba. La razón era buena —pulsar
 * «Registrar» otra vez creaba un SEGUNDO movimiento por la misma plata— pero
 * la solución era peor que el problema: para no duplicar había que dejar a
 * medias. Deshaciendo no hay nada que duplicar, y el reintento es el mismo
 * camino de la primera vez.
 *
 * ── Y si el deshacer TAMBIÉN falla ──────────────────────────────────────────
 * Entonces sí quedó registrado, y hay que decirlo. Ahí se recuerda el id: el
 * siguiente intento ACTUALIZA ese movimiento en vez de crear otro.
 */
export function useSaveMovement(
  sheet: MovementSheetState,
  transaction: Transaction | null | undefined,
  onClose: () => void,
) {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    sheet.setError(null);
    const body = movementPayload(sheet);
    const existing = transaction?.id ?? sheet.registered;
    let id = existing ?? undefined;
    /** Lo creó ESTE intento. Es lo único que se puede deshacer sin preguntar. */
    let wasJustCreated = false;

    try {
      if (existing != null) await update.mutateAsync({ id: existing, changes: body });
      else {
        const created = await create.mutateAsync(body as never);
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
      // Editando, o reintentando sobre uno que ya estaba: aquí no hay nada que
      // deshacer. Lo que había antes sigue estando, que es lo correcto.
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
