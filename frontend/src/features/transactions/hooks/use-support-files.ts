import { useEffect, useState } from 'react';

import { useReceipts, useUploadReceipts } from '@/features/transactions/api/receipts';
import type { ReceiptFailure } from '@/features/transactions/model/supports';
import { ApiClientError, apiBlob } from '@/shared/api/api-client';
import { getSoportesDownloadUrl } from '@/shared/api/generated/soportes-v2/soportes-v2';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';

/**
 * Los archivos de los soportes de un movimiento, ya descargados.
 *
 * ── Por qué el archivo se pide con código y no con un `src` ─────────────────
 * Porque el token de sesión vive en memoria, no en una cookie, así que una
 * petición que arranca el navegador por su cuenta —la de un `src`— sale sin
 * autorización. Se piden con `fetch`, con el token, y se convierten en `blob:`
 * que el visor sí puede consumir.
 *
 * Eso no es un rodeo para esquivar una limitación: es la consecuencia de que
 * el recibo NO tenga una URL que funcione para quien la tenga. Si bastara un
 * `src`, bastaría también con que alguien copiara el enlace.
 */
export function useSupportFiles(transactionId: number) {
  const receipts = useReceipts(transactionId);
  const list = receipts.data ?? [];

  /** El `blob:` de cada soporte, por id. Se descargan una vez y se comparten. */
  const [urls, setUrls] = useState<Record<string, string>>({});
  /** Los que no se están viendo, y POR QUÉ. Ver `FalloDeSoporte`. */
  const [failures, setFailures] = useState<Readonly<Record<string, ReceiptFailure>>>({});
  /** Sube al reintentar, y con eso vuelve a correr el efecto de las descargas. */
  const [attempt, setAttempt] = useState(0);

  /*
    Los que el servidor ya dijo que no tiene se marcan de entrada, sin
    pedirlos: sería una petición que se sabe que va a devolver 404.

    Es estado DERIVADO de la lista, no un efecto, así que se ajusta en el
    render y no dentro del efecto de las descargas. Y por eso la limpieza de
    ese efecto ya no vacía `fallos`: con la misma firma, esto lo deja como toca
    —vacío si no hay lista, o con los ausentes— ANTES de que el efecto anterior
    se limpie. Si la limpieza lo vaciara después, se llevaría la siembra por
    delante.
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

      apiBlob(getSoportesDownloadUrl(transactionId, s.id), cutoff.signal)
        .then((blob) => {
          if (cutoff.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setUrls((previous) => ({ ...previous, [String(s.id)]: url }));
        })
        .catch(() => {
          // Se cayó la descarga, y eso NO dice que el archivo no esté: puede
          // ser un 500, la sesión caducada o la red. Se marca como lo que es
          // —no se pudo cargar— y se ofrece reintentar.
          //
          // El corte no cuenta: abortamos nosotros al desmontar o al cambiar
          // de movimiento, y eso no es un fallo de nada.
          if (cutoff.signal.aborted) return;
          setFailures((previous) => ({ ...previous, [String(s.id)]: 'sin-cargar' }));
        });
    }

    return () => {
      cutoff.abort();
      // Cada blob vive en la memoria de la pestaña hasta que se le suelta. Sin
      // esto, abrir veinte movimientos deja ciento sesenta archivos cargados.
      for (const url of created) URL.revokeObjectURL(url);
      setUrls({});
    };
    // `lista.length` y no `lista`: la consulta devuelve un array nuevo en cada
    // render y con él las descargas empezarían otra vez sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, list.length, attempt]);

  return {
    isLoading: receipts.isPending,
    list,
    urls,
    failures,
    retry: () => setAttempt((n) => n + 1),
  };
}

/** Subir soportes a un movimiento ya guardado, con su avance y su error. */
export function useSupportUpload(transactionId: number, onDone: () => void) {
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
