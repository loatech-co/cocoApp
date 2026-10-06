import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiUpload } from '@/shared/api/api-client';
import type { Receipt } from '@/shared/api/generated/model';
import {
  getSoportesUploadUrl,
  soportesList,
  soportesRemove,
} from '@/shared/api/generated/soportes-v2/soportes-v2';
import { allPages } from '@/shared/api/pages';
import { keys } from '@/shared/api/query-keys';
import { shrinkReceipts } from '@/shared/lib/shrink-receipt';

/**
 * Los soportes de un movimiento: la FICHA de cada recibo, no el recibo.
 *
 * El binario se pide aparte y solo cuando alguien lo mira (`apiBlob`): traer
 * ocho PDFs de doscientos kilos cada vez que se abre un movimiento sería pagar
 * por adelantado por lo que casi nadie va a abrir.
 */
export function useReceipts(transactionId: number | undefined) {
  return useQuery({
    queryKey: keys.receipts(transactionId ?? 0),
    enabled: transactionId !== undefined,
    // `enabled` guarantees the id; the `?? 0` only satisfies the type.
    queryFn: (): Promise<Receipt[]> =>
      allPages(async (page) => soportesList(transactionId ?? 0, page)),
  });
}

/** Sube soportes a un movimiento y devuelve la lista ya actualizada. */
export function useUploadReceipts(transactionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      files,
      onProgress,
    }: {
      files: File[];
      onProgress?: (fraction: number) => void;
    }): Promise<Receipt[]> => {
      const data = new FormData();
      // Encogidas antes de viajar: una foto de teléfono son cuatro megas de
      // los que el servidor se queda con 1100px de ancho. El porqué largo
      // —incluido el HEIC del iPhone, que allá no se puede abrir— está en
      // `lib/encoger-soporte.ts`.
      for (const file of await shrinkReceipts(files)) data.append('files', file);
      return apiUpload<Receipt[]>(getSoportesUploadUrl(transactionId), data, onProgress);
    },
    // Se escribe la respuesta en la caché en vez de invalidarla: el servidor
    // acaba de devolver la lista entera y volver a pedirla es un viaje para
    // traer lo que ya está en la mano.
    onSuccess: (list) => queryClient.setQueryData(keys.receipts(transactionId), list),
  });
}

export function useDeleteReceipt(transactionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (receiptId: number) => {
      await soportesRemove(transactionId, receiptId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.receipts(transactionId) }),
  });
}
