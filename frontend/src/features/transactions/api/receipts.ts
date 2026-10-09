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
 * A transaction's receipts: the RECORD of each receipt, not the receipt.
 *
 * The binary is requested separately and only when someone looks at it (`apiBlob`): fetching
 * eight two-hundred-kilobyte PDFs every time a transaction is opened would be paying
 * up front for what almost nobody is going to open.
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

/** Uploads receipts to a transaction and returns the already updated list. */
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
      // Shrunk before traveling: a phone photo is four megabytes of
      // which the server keeps 1100px of width. The long why
      // —including the iPhone's HEIC, which cannot be opened over there— is in
      // `shared/lib/shrink-receipt.ts`.
      for (const file of await shrinkReceipts(files)) data.append('files', file);
      return apiUpload<Receipt[]>(getSoportesUploadUrl(transactionId), data, onProgress);
    },
    // The response is written into the cache instead of invalidating it: the server
    // just returned the whole list and asking for it again is a trip to
    // bring what is already in hand.
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
