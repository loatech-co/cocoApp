import type { SubmitEvent } from 'react';

import {
  useActualizarMovimiento,
  useCrearMovimiento,
  useEliminarMovimiento,
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
function movementPayload(ficha: MovementSheetState) {
  return {
    date: ficha.date,
    amount: ficha.amount.replace(',', '.'),
    type: ficha.type,
    description: ficha.description.trim() || null,
    // El comercio sigue a la descripción: es lo que alimenta la
    // categorización automática de futuras importaciones.
    merchant: ficha.description.trim() || null,
    notes: ficha.notes.trim() || null,
    categoryId: ficha.categoryId ?? null,
    // De dónde entró, y el texto del que salió si hubo recibo: es lo que
    // permite saber después por qué se clasificó así, y reinterpretarlo.
    source: 'web' as const,
    rawText: ficha.textoLeido.trim() || null,
  };
}

/** Los soportes, ya con un movimiento del que colgar. */
async function uploadPending(id: number, pendientes: File[]): Promise<void> {
  const datos = new FormData();
  // Ver `shared/lib/encoger-soporte.ts`: lo que sube es un JPG liviano, no la
  // foto de doce megapíxeles que da un teléfono.
  for (const archivo of await shrinkReceipts(pendientes)) {
    datos.append('files', archivo);
  }
  await apiUpload(getSoportesUploadUrl(id), datos);
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
function learnFromSuggestion(cuerpo: ReturnType<typeof movementPayload>): void {
  if (cuerpo.categoryId === null || !cuerpo.description) return;
  void categorizationLearn({
    description: cuerpo.description,
    categoryId: cuerpo.categoryId,
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
export function useCreateInside(ficha: MovementSheetState) {
  const crearCategoria = useCreateCategory();

  async function crearDentro(nombre: string, padreId: number | undefined): Promise<void> {
    if (nombre.trim() === '' || padreId === undefined) return;
    ficha.setError(null);

    try {
      const nuevo = await crearCategoria.mutateAsync({
        name: nombre.trim(),
        kind: 'expense',
        parentId: padreId,
      });
      ficha.proponer({ categoryId: nuevo.id, origen: 'manual' });
    } catch (e) {
      ficha.setError(
        e instanceof ApiClientError ? e.message : t('transactions.sheet.createFailed'),
      );
    }
  }

  return { crearDentro, creando: crearCategoria.isPending };
}

/** Deshace lo que ESTE intento creó, porque su soporte no llegó. */
async function undoCreation(
  eliminar: ReturnType<typeof useEliminarMovimiento>,
  ficha: MovementSheetState,
  id: number,
  dijo: string,
): Promise<void> {
  try {
    await eliminar.mutateAsync(id);
    ficha.setRegistrado(null);
    ficha.setError(t('transactions.sheet.supportFailedUndone', { detail: dijo }));
  } catch {
    ficha.setRegistrado(id);
    ficha.setError(t('transactions.sheet.supportFailedKept', { detail: dijo }));
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
  ficha: MovementSheetState,
  movimiento: Transaction | null | undefined,
  onCerrar: () => void,
) {
  const crear = useCrearMovimiento();
  const actualizar = useActualizarMovimiento();
  const eliminar = useEliminarMovimiento();

  async function onSubmit(evento: SubmitEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    ficha.setError(null);
    const cuerpo = movementPayload(ficha);
    const existente = movimiento?.id ?? ficha.registrado;
    let id = existente ?? undefined;
    /** Lo creó ESTE intento. Es lo único que se puede deshacer sin preguntar. */
    let recienCreado = false;

    try {
      if (existente != null) await actualizar.mutateAsync({ id: existente, cambios: cuerpo });
      else {
        const creado = await crear.mutateAsync(cuerpo as never);
        id = (creado as { id: number }).id;
        recienCreado = true;
      }

      if (id !== undefined && ficha.pendientes.length > 0) {
        ficha.setSubiendo(true);
        await uploadPending(id, ficha.pendientes);
      }
      if (ficha.huboSugerencia) learnFromSuggestion(cuerpo);
      onCerrar();
    } catch (e) {
      const dijo = e instanceof ApiClientError ? e.message : t('centers.saveFailed');
      // Editando, o reintentando sobre uno que ya estaba: aquí no hay nada que
      // deshacer. Lo que había antes sigue estando, que es lo correcto.
      if (!recienCreado || id === undefined) ficha.setError(dijo);
      else await undoCreation(eliminar, ficha, id, dijo);
    } finally {
      ficha.setSubiendo(false);
    }
  }

  return {
    onSubmit,
    guardando: crear.isPending || actualizar.isPending || ficha.subiendo,
    eliminar,
  };
}
