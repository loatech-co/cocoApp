import { useEffect, useState } from 'react';

import { useReceipts, useUploadReceipts } from '@/features/transactions/api/receipts';
import type { ReceiptFailure } from '@/features/transactions/model/receipts';
import { ApiClientError, apiBlob } from '@/shared/api/api-client';
import { getReceiptsDownloadUrl } from '@/shared/api/generated/receipts-v2/receipts-v2';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';

/**
 * The files of a transaction's receipts, already downloaded.
 *
 * ── Why the file is requested with code and not with a `src` ───────────────
 * Because the session token lives in memory, not in a cookie, so a
 * request the browser starts on its own —that of a `src`— goes out without
 * authorization. They are requested with `fetch`, with the token, and turned into `blob:`
 * URLs the viewer can consume.
 *
 * That is not a detour to dodge a limitation: it is the consequence of
 * the receipt NOT having a URL that works for whoever has it. If a
 * `src` were enough, it would also be enough for someone to copy the link.
 */
export function useReceiptFiles(transactionId: number) {
  const receipts = useReceipts(transactionId);
  const list = receipts.data ?? [];

  /** The `blob:` of each receipt, by id. They are downloaded once and shared. */
  const [urls, setUrls] = useState<Record<string, string>>({});
  /** The ones not being shown, and WHY. See `ReceiptFailure`. */
  const [failures, setFailures] = useState<Readonly<Record<string, ReceiptFailure>>>({});
  /** Goes up on retry, and with that the downloads effect runs again. */
  const [attempt, setAttempt] = useState(0);

  /*
    The ones the server already said it does not have are marked up front, without
    requesting them: it would be a request known to return 404.

    It is state DERIVED from the list, not an effect, so it is adjusted in
    render and not inside the downloads effect. And that is why the cleanup of
    that effect no longer empties `failures`: with the same signature, this leaves it as it should be
    —empty if there is no list, or with the missing ones— BEFORE the previous effect
    is cleaned up. If the cleanup emptied it afterward, it would take the seeding
    down with it.
  */
  useOnChange([transactionId, list.length, attempt], () => {
    setFailures(
      Object.fromEntries(
        list.filter((s) => !s.isAvailable).map((s) => [String(s.id), 'ausente' as const]),
      ),
    );
  });

  useEffect(() => {
    if (list.length === 0) return;

    const cutoff = new AbortController();
    const created: string[] = [];

    for (const s of list) {
      if (!s.isAvailable) continue;

      apiBlob(getReceiptsDownloadUrl(transactionId, s.id), cutoff.signal)
        .then((blob) => {
          if (cutoff.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setUrls((previous) => ({ ...previous, [String(s.id)]: url }));
        })
        .catch(() => {
          // The download failed, and that does NOT say the file is not there: it may
          // be a 500, an expired session or the network. It is marked as what it is
          // —it could not be loaded— and a retry is offered.
          //
          // The abort does not count: we abort it ourselves on unmount or when switching
          // transactions, and that is not a failure of anything.
          if (cutoff.signal.aborted) return;
          setFailures((previous) => ({ ...previous, [String(s.id)]: 'sin-cargar' }));
        });
    }

    return () => {
      cutoff.abort();
      // Each blob lives in the tab's memory until it is released. Without
      // this, opening twenty transactions leaves a hundred and sixty files loaded.
      for (const url of created) URL.revokeObjectURL(url);
      setUrls({});
    };
    // `list.length` and not `list`: the query returns a new array on every
    // render and with it the downloads would start over nonstop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, list.length, attempt]);

  return {
    isLoading: receipts.isPending,
    /**
     * The LIST could not be requested. It is not «no receipts»: shown as the
     * empty drop zone, a 500 or a dropped network read as a transaction
     * without its paper, and someone would upload it again.
     */
    isError: receipts.isError,
    list,
    urls,
    failures,
    retry: () => {
      // A failed list is requested again; a failed download, only its file.
      if (receipts.isError) void receipts.refetch();
      setAttempt((n) => n + 1);
    },
  };
}

/** Upload receipts to an already saved transaction, with their progress and their error. */
export function useReceiptUpload(transactionId: number, onDone: () => void) {
  const upload = useUploadReceipts(transactionId);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function accept(files: File[]): Promise<void> {
    if (files.length === 0) return;
    setUploadError(null);
    setProgress(0);

    try {
      await upload.mutateAsync({ files, onProgress: setProgress });
      onDone();
    } catch (e) {
      setUploadError(
        e instanceof ApiClientError ? e.message : t('transactions.supports.uploadFailed'),
      );
    }
  }

  return { isUploading: upload.isPending, progress, uploadError, accept };
}
