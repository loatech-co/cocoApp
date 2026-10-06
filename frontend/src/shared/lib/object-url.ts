import { useEffect, useState } from 'react';

/*
  ── Por qué un efecto que escribe estado ─────────────────────────────────────
  Un `blob:` es un recurso del navegador con ciclo de vida —se crea, se usa, se
  suelta— y el sitio de un ciclo de vida es un efecto con su limpieza. La regla
  pide no escribir estado dentro de un efecto, pero aquí el estado es solo el
  asa del recurso: no hay forma de tener el `blob:` sin crearlo, y crearlo en
  el render sería un efecto secundario sin limpieza posible.

  La alternativa que la regla sugiere —`useMemo` para crearlo y un efecto solo
  para soltarlo— se rompe con `StrictMode`: React simula desmontar y volver a
  montar, la limpieza suelta el `blob:` y el memo, que no se repite, queda
  apuntando a uno que ya no existe. La imagen sale rota en desarrollo. Esta es
  la forma correcta, y la excepción lo dice.
*/

/**
 * El `blob:` de un archivo, mientras el archivo siga siendo el mismo.
 *
 * Se crea y se suelta aquí porque vive exactamente lo que vive quien lo usa.
 * Creado más arriba habría que acordarse de soltarlo en cada una de las
 * salidas, y el que se olvide se queda en la memoria de la pestaña con el
 * archivo entero dentro.
 */
export function useObjectUrl(file: File | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const created = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recurso con ciclo de vida, ver arriba
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [file]);

  return url;
}

/** Los `blob:` de una lista de archivos, creados una vez y soltados juntos. */
export function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = files.map((a) => URL.createObjectURL(a));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recurso con ciclo de vida, ver arriba
    setUrls(created);
    // Cada blob vive en la memoria de la pestaña hasta que se le suelta.
    return () => {
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [files]);

  return urls;
}
