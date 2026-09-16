import { ChevronLeft, ChevronRight, FileWarning, Loader2, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiBlob } from '@/lib/api-client';
import { cargarPdfjs } from '@/lib/pdf';
import { useSoportes } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Soporte } from '@coco/types';

/**
 * Los soportes de un movimiento: el recibo que prueba que ese pago existió.
 *
 * ── Por qué miniaturas y no pestañas ────────────────────────────────────────
 * Porque "Soporte 1 de 8" no dice nada. Ocho pestañas iguales obligan a
 * abrirlas una por una para encontrar la factura que uno busca, que es
 * exactamente el trabajo que uno venía a evitar. Una página dibujada se
 * reconoce de un vistazo: el recibo del agua no se parece al del colegio.
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
export function Soportes({ transactionId }: { transactionId: number }) {
  const soportes = useSoportes(transactionId);
  const lista = soportes.data ?? [];

  /** El `blob:` de cada soporte, por id. Se descargan una vez y se comparten. */
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [grande, setGrande] = useState<number | null>(null);

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
          /* La miniatura se queda en su marco vacío; el visor lo dirá. */
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
  }, [transactionId, lista.length]);

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

  return (
    <>
      {/* Tamaño fijo y que fluyan: con `grid-cols-N` un solo soporte se
          estiraba hasta ocupar un cuarto de la ficha y parecía otra cosa. */}
      <ul className="flex flex-wrap gap-3">
        {lista.map((s, i) => (
          <li key={String(s.id)}>
            <Miniatura
              soporte={s}
              url={urls[String(s.id)]}
              numero={i + 1}
              onAbrir={() => setGrande(i)}
            />
          </li>
        ))}
      </ul>

      {grande !== null && (
        <VisorGrande
          lista={lista}
          urls={urls}
          indice={grande}
          onIr={setGrande}
          onCerrar={() => setGrande(null)}
        />
      )}
    </>
  );
}

/** Un soporte en pequeño: la primera página, dibujada. */
function Miniatura({
  soporte,
  url,
  numero,
  onAbrir,
}: {
  soporte: Soporte;
  url?: string;
  numero: number;
  onAbrir: () => void;
}) {
  const esImagen = soporte.mime_type.startsWith('image/');

  return (
    <button
      type="button"
      onClick={onAbrir}
      disabled={!soporte.disponible}
      title={soporte.nombre_archivo}
      className={cn(
        'group flex w-[120px] flex-col gap-1.5 text-left',
        soporte.disponible ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
      )}
    >
      {/* Proporción de una hoja: 1 a 1,41, que es el A4 en el que llega casi
          todo. Con un cuadrado, cada recibo se recortaba por la mitad. */}
      <span
        className={cn(
          'relative flex aspect-[1/1.41] w-full items-center justify-center overflow-hidden',
          'rounded-2xl bg-card ring-1 ring-border transition-all',
          soporte.disponible && 'group-hover:ring-2 group-hover:ring-primary',
        )}
      >
        {!soporte.disponible ? (
          <FileWarning className="size-6 text-muted-foreground" aria-hidden="true" />
        ) : !url ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : esImagen ? (
          <img src={url} alt="" className="size-full object-cover object-top" />
        ) : (
          <LienzoPdf url={url} />
        )}

        <span className="tabular absolute left-1.5 top-1.5 rounded-full bg-tinta-950/70 px-1.5 text-[11px] font-medium text-tinta-50">
          {numero}
        </span>
      </span>

      <span className="block truncate text-[11px] text-muted-foreground">
        {(soporte.tamano / 1024).toFixed(0)} KB
      </span>
    </button>
  );
}

/**
 * La primera página de un PDF, pintada en un lienzo.
 *
 * Se dibuja al DOBLE de resolución que su caja y se encoge por CSS: en una
 * pantalla retina, dibujarla al tamaño de la caja deja un texto borroso que
 * parece un escaneo malo cuando el escaneo está bien.
 */
function LienzoPdf({ url }: { url: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;

    void (async () => {
      try {
        const pdfjs = await cargarPdfjs();
        const documento = await pdfjs.getDocument({ url }).promise;
        const pagina = await documento.getPage(1);

        if (!vivo || !lienzo.current) return;

        const ANCHO = 240;
        const base = pagina.getViewport({ scale: 1 });
        const vista = pagina.getViewport({ scale: ANCHO / base.width });

        const contexto = lienzo.current.getContext('2d');
        if (!contexto) return;

        lienzo.current.width = vista.width;
        lienzo.current.height = vista.height;

        await pagina.render({ canvas: lienzo.current, canvasContext: contexto, viewport: vista })
          .promise;
        await documento.cleanup();
      } catch {
        if (vivo) setFallo(true);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [url]);

  if (fallo) return <FileWarning className="size-6 text-muted-foreground" aria-hidden="true" />;

  return <canvas ref={lienzo} className="size-full object-cover object-top" aria-hidden="true" />;
}

/**
 * El soporte a tamaño de leerlo.
 *
 * Por encima del modal, no dentro: un recibo es una hoja entera y meterlo en
 * el hueco que sobra de una ficha lo deja del tamaño de un sello. Y con las
 * flechas, porque cuando una factura viene partida en ocho lo que uno hace es
 * pasarlas.
 */
function VisorGrande({
  lista,
  urls,
  indice,
  onIr,
  onCerrar,
}: {
  lista: Soporte[];
  urls: Record<string, string>;
  indice: number;
  onIr: (i: number) => void;
  onCerrar: () => void;
}) {
  const soporte = lista[indice];
  const url = urls[String(soporte.id)];

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowLeft' && indice > 0) onIr(indice - 1);
      if (e.key === 'ArrowRight' && indice < lista.length - 1) onIr(indice + 1);
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [indice, lista.length, onIr, onCerrar]);

  const esImagen = soporte.mime_type.startsWith('image/');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={soporte.nombre_archivo}
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      // Por encima del modal del movimiento, que está en z-50.
      className="fixed inset-0 z-[60] flex flex-col bg-tinta-950/85 p-3 backdrop-blur-sm sm:p-6"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-tinta-50">
          <span className="block truncate font-medium">{soporte.nombre_archivo}</span>
          {lista.length > 1 && (
            <span className="tabular block text-xs text-tinta-50/70">
              {indice + 1} de {lista.length}
            </span>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          {lista.length > 1 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={indice === 0}
                onClick={() => onIr(indice - 1)}
                aria-label="Anterior"
                className="text-tinta-50 hover:bg-white/10 hover:text-tinta-50"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={indice === lista.length - 1}
                onClick={() => onIr(indice + 1)}
                aria-label="Siguiente"
                className="text-tinta-50 hover:bg-white/10 hover:text-tinta-50"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-tinta-50 hover:bg-white/10 hover:text-tinta-50"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white">
        {!url ? (
          <Loader2 className="size-6 animate-spin text-tinta-600" aria-hidden="true" />
        ) : esImagen ? (
          <img src={url} alt={soporte.nombre_archivo} className="max-h-full max-w-full object-contain" />
        ) : (
          /* Sin `sandbox`: un sandbox vacío bloquea también al visor de PDF de
             Chrome, que es él mismo una aplicación, y en su lugar sale un
             cuadro gris que dice "This page has been blocked by Chrome". */
          <iframe src={url} title={soporte.nombre_archivo} className="size-full border-0" />
        )}
      </div>
    </div>
  );
}
