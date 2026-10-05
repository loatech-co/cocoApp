import { useEffect, useState } from 'react';

import { useSoportes, useSubirSoportes } from '@/features/transactions/api/soportes';
import type { FalloDeSoporte } from '@/features/transactions/model/supports';
import { ApiClientError, apiBlob } from '@/shared/api/api-client';
import { useAlCambiar } from '@/shared/lib/al-cambiar';

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
  const soportes = useSoportes(transactionId);
  const lista = soportes.data ?? [];

  /** El `blob:` de cada soporte, por id. Se descargan una vez y se comparten. */
  const [urls, setUrls] = useState<Record<string, string>>({});
  /** Los que no se están viendo, y POR QUÉ. Ver `FalloDeSoporte`. */
  const [fallos, setFallos] = useState<Readonly<Record<string, FalloDeSoporte>>>({});
  /** Sube al reintentar, y con eso vuelve a correr el efecto de las descargas. */
  const [intento, setIntento] = useState(0);

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
  useAlCambiar([transactionId, lista.length, intento], () => {
    setFallos(
      Object.fromEntries(
        lista.filter((s) => !s.disponible).map((s) => [String(s.id), 'ausente' as const]),
      ),
    );
  });

  useEffect(() => {
    if (lista.length === 0) return;

    const corte = new AbortController();
    const creados: string[] = [];

    for (const s of lista) {
      if (!s.disponible) continue;

      apiBlob(`/transactions/${transactionId}/soportes/${s.id}`, corte.signal)
        .then((blob) => {
          if (corte.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          creados.push(url);
          setUrls((previo) => ({ ...previo, [String(s.id)]: url }));
        })
        .catch(() => {
          // Se cayó la descarga, y eso NO dice que el archivo no esté: puede
          // ser un 500, la sesión caducada o la red. Se marca como lo que es
          // —no se pudo cargar— y se ofrece reintentar.
          //
          // El corte no cuenta: abortamos nosotros al desmontar o al cambiar
          // de movimiento, y eso no es un fallo de nada.
          if (corte.signal.aborted) return;
          setFallos((previo) => ({ ...previo, [String(s.id)]: 'sin-cargar' }));
        });
    }

    return () => {
      corte.abort();
      // Cada blob vive en la memoria de la pestaña hasta que se le suelta. Sin
      // esto, abrir veinte movimientos deja ciento sesenta archivos cargados.
      for (const url of creados) URL.revokeObjectURL(url);
      setUrls({});
    };
    // `lista.length` y no `lista`: la consulta devuelve un array nuevo en cada
    // render y con él las descargas empezarían otra vez sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, lista.length, intento]);

  return {
    cargando: soportes.isPending,
    lista,
    urls,
    fallos,
    reintentar: () => setIntento((n) => n + 1),
  };
}

/** Subir soportes a un movimiento ya guardado, con su avance y su error. */
export function useSupportUpload(transactionId: number, alTerminar: () => void) {
  const subir = useSubirSoportes(transactionId);
  const [progreso, setProgreso] = useState(0);
  const [errorDeSubida, setErrorDeSubida] = useState<string | null>(null);

  async function aceptar(archivos: File[]): Promise<void> {
    if (archivos.length === 0) return;
    setErrorDeSubida(null);
    setProgreso(0);

    try {
      await subir.mutateAsync({ archivos, onProgreso: setProgreso });
      alTerminar();
    } catch (e) {
      setErrorDeSubida(
        e instanceof ApiClientError ? e.message : 'No se pudo subir. Inténtalo otra vez.',
      );
    }
  }

  return { subiendo: subir.isPending, progreso, errorDeSubida, aceptar };
}
