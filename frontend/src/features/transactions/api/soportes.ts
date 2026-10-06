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
import { encogerSoportes } from '@/shared/lib/encoger-soporte';

/**
 * Los soportes de un movimiento: la FICHA de cada recibo, no el recibo.
 *
 * El binario se pide aparte y solo cuando alguien lo mira (`apiBlob`): traer
 * ocho PDFs de doscientos kilos cada vez que se abre un movimiento sería pagar
 * por adelantado por lo que casi nadie va a abrir.
 */
export function useSoportes(transactionId: number | undefined) {
  return useQuery({
    queryKey: keys.receipts(transactionId ?? 0),
    enabled: transactionId !== undefined,
    // `enabled` guarantees the id; the `?? 0` only satisfies the type.
    queryFn: (): Promise<Receipt[]> =>
      allPages(async (page) => soportesList(transactionId ?? 0, page)),
  });
}

/** Sube soportes a un movimiento y devuelve la lista ya actualizada. */
export function useSubirSoportes(transactionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      archivos,
      onProgreso,
    }: {
      archivos: File[];
      onProgreso?: (fraccion: number) => void;
    }): Promise<Receipt[]> => {
      const datos = new FormData();
      // Encogidas antes de viajar: una foto de teléfono son cuatro megas de
      // los que el servidor se queda con 1100px de ancho. El porqué largo
      // —incluido el HEIC del iPhone, que allá no se puede abrir— está en
      // `lib/encoger-soporte.ts`.
      for (const archivo of await encogerSoportes(archivos)) datos.append('files', archivo);
      return apiUpload<Receipt[]>(getSoportesUploadUrl(transactionId), datos, onProgreso);
    },
    // Se escribe la respuesta en la caché en vez de invalidarla: el servidor
    // acaba de devolver la lista entera y volver a pedirla es un viaje para
    // traer lo que ya está en la mano.
    onSuccess: (lista) => queryClient.setQueryData(keys.receipts(transactionId), lista),
  });
}

export function useEliminarSoporte(transactionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (soporteId: number) => {
      await soportesRemove(transactionId, soporteId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.receipts(transactionId) }),
  });
}
