import { FileWarning, Loader2, Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';

import { apiBlob } from '@/lib/api-client';
import { useSoportes } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Soporte } from '@coco/types';

/**
 * Los soportes de un movimiento: el recibo que prueba que ese pago existió.
 *
 * ── Por qué el archivo se pide con código y no con un `src` ─────────────────
 * Porque el token de sesión vive en memoria, no en una cookie, así que una
 * petición que arranca el navegador por su cuenta —la de un `src`— sale sin
 * autorización. El archivo se pide con `fetch`, con el token, y se convierte
 * en un `blob:` que el visor sí puede consumir.
 *
 * Eso no es un rodeo para esquivar una limitación: es la consecuencia de que
 * el recibo NO tenga una URL que funcione para quien la tenga. Si bastara un
 * `src`, bastaría también con que alguien copiara ese enlace.
 *
 * ── Por qué uno a la vez ────────────────────────────────────────────────────
 * Se descarga el que se está mirando, no los ocho. La factura de Claro de un
 * mes son tres PDFs de doscientos kilos: traerlos todos al abrir un movimiento
 * es pagar por adelantado por lo que casi nadie va a abrir.
 */
export function Soportes({ transactionId }: { transactionId: number }) {
  const soportes = useSoportes(transactionId);
  const [activo, setActivo] = useState(0);

  const lista = soportes.data ?? [];
  // Si cambia el movimiento, la pestaña vuelve a la primera: quedarse en la
  // tercera de un movimiento que solo tiene una deja el visor en blanco.
  useEffect(() => setActivo(0), [transactionId]);

  if (soportes.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Buscando soportes…
      </p>
    );
  }

  if (lista.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Paperclip className="size-4 shrink-0" aria-hidden="true" />
        Este movimiento no tiene soportes.
      </p>
    );
  }

  const elegido = lista[Math.min(activo, lista.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      {/* Con uno solo no hay nada que elegir: una sola pestaña es un adorno
          que ocupa una fila y no responde ninguna pregunta. */}
      {lista.length > 1 && (
        <div role="tablist" aria-label="Soportes" className="flex flex-wrap gap-1.5">
          {lista.map((s, i) => (
            <button
              key={String(s.id)}
              type="button"
              role="tab"
              aria-selected={i === activo}
              onClick={() => setActivo(i)}
              className={cn(
                'rounded-full px-3 py-1 text-xs transition-colors',
                i === activo
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-background',
              )}
            >
              Soporte {i + 1} de {lista.length}
            </button>
          ))}
        </div>
      )}

      <Visor key={String(elegido.id)} transactionId={transactionId} soporte={elegido} />
    </div>
  );
}

/** Un soporte, ya descargado y en pantalla. */
function Visor({ transactionId, soporte }: { transactionId: number; soporte: Soporte }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!soporte.disponible) return;

    // Se cancela al cambiar de pestaña: sin esto, pasar rápido por cuatro
    // soportes deja cuatro descargas en vuelo y la última en llegar —que no
    // tiene por qué ser la que se está mirando— gana.
    const corte = new AbortController();
    let objeto: string | null = null;

    apiBlob(`/transactions/${transactionId}/soportes/${soporte.id}`, corte.signal)
      .then((blob) => {
        objeto = URL.createObjectURL(blob);
        setUrl(objeto);
      })
      .catch((e: unknown) => {
        if (corte.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.');
      });

    return () => {
      corte.abort();
      // El blob vive en la memoria de la pestaña hasta que se le suelta. Sin
      // esto, mirar veinte recibos deja veinte archivos cargados.
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [transactionId, soporte.id, soporte.disponible]);

  const marco = 'h-[min(60vh,32rem)] w-full overflow-hidden rounded-2xl bg-secondary/60';

  if (!soporte.disponible) {
    return (
      <Aviso Icono={FileWarning}>
        El archivo de este soporte no está en el almacén. La ficha existe, el archivo
        todavía no.
      </Aviso>
    );
  }

  if (error) return <Aviso Icono={FileWarning}>{error}</Aviso>;

  if (!url) {
    return (
      <div className={cn(marco, 'flex items-center justify-center')}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  const esImagen = soporte.mime_type.startsWith('image/');

  return (
    <figure className="flex flex-col gap-2">
      <div className={cn(marco, esImagen && 'flex items-center justify-center')}>
        {esImagen ? (
          <img
            src={url}
            alt={soporte.nombre_archivo}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <iframe
            src={url}
            title={soporte.nombre_archivo}
            className="size-full border-0"
            // El PDF viene de un blob del propio origen, pero un PDF puede
            // llevar enlaces y formularios. El sandbox lo deja enseñarse y
            // nada más.
            sandbox=""
          />
        )}
      </div>

      <figcaption className="truncate text-xs text-muted-foreground">
        {soporte.nombre_archivo} · {(soporte.tamano / 1024).toFixed(0)} KB
      </figcaption>
    </figure>
  );
}

function Aviso({
  Icono,
  children,
}: {
  Icono: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-secondary/60 p-3 text-xs text-muted-foreground">
      <Icono className="mt-px size-4 shrink-0" aria-hidden={true} />
      <span>{children}</span>
    </p>
  );
}
