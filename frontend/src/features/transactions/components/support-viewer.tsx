import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { FalloDeSoporte } from '@/features/transactions/model/supports';
import { ANCHO_HOJA, PaginaPdf } from '@/shared/ui/atoms/pdf-page';
import type { Soporte } from '@coco/types';

import { ConfirmSupportDeletion } from './confirm-support-deletion';
import { SoporteQueNoSeVe } from './support-unavailable';
import {
  ViewerArrow,
  ViewerControls,
  ViewerHeader,
  useViewerZoom,
} from './support-viewer-controls';

/** Escape cierra, las flechas pasan de soporte, `+` y `-` amplían. */
function useViewerKeys(
  indice: number,
  total: number,
  onIr: (i: number) => void,
  onCerrar: () => void,
  cambiarZoom: (paso: number) => void,
): void {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowLeft' && indice > 0) onIr(indice - 1);
      else if (e.key === 'ArrowRight' && indice < total - 1) onIr(indice + 1);
      else if (e.key === '+' || e.key === '=') cambiarZoom(1);
      else if (e.key === '-') cambiarZoom(-1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [indice, total, onIr, onCerrar, cambiarZoom]);
}

interface ViewerProps {
  transactionId: number;
  lista: Soporte[];
  urls: Record<string, string>;
  /** Por qué no se ve cada uno, si es que no se ve. Ver `FalloDeSoporte`. */
  fallos: Readonly<Record<string, FalloDeSoporte>>;
  onReintentar: () => void;
  indice: number;
  onIr: (i: number) => void;
  onCerrar: () => void;
}

/**
 * El pase de soportes: el recibo a tamaño de leerlo.
 *
 * ── Por qué el PDF también se dibuja ────────────────────────────────────────
 * Un `<iframe>` con el visor del navegador enseña el PDF, pero trae su propia
 * barra, su propio zoom y su propio idioma, y encima cambia según el navegador
 * y el sistema. Al lado de una imagen, que se amplía con los botones de aquí,
 * el mismo gesto hacía dos cosas distintas según qué soporte tocara.
 *
 * Dibujando la página en un lienzo, las dos son lo mismo: un mapa de bits que
 * este componente amplía, desplaza y descarga igual. Cuesta un render de
 * pdf.js y a cambio el visor se comporta siempre igual.
 */
export function Pase(props: ViewerProps) {
  const { lista, indice, onIr, onCerrar } = props;
  const [confirmando, setConfirmando] = useState(false);
  const soporte = lista[indice];
  const vista = useViewerZoom(indice);
  useViewerKeys(indice, lista.length, onIr, onCerrar, vista.cambiarZoom);

  if (soporte === undefined) return null;
  const url = props.urls[String(soporte.id)];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={soporte.nombre_archivo}
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      // Por encima del modal del movimiento, que está en z-50.
      className="fixed inset-0 z-[60] flex flex-col bg-sala/90 p-3 backdrop-blur-sm sm:p-6"
    >
      <ViewerHeader
        soporte={soporte}
        indice={indice}
        total={lista.length}
        url={url}
        onBorrar={() => setConfirmando(true)}
        onCerrar={onCerrar}
      />

      {/* ── El recibo ─────────────────────────────────────────────────── */}
      <ViewerStage
        soporte={soporte}
        url={url}
        fallo={props.fallos[String(soporte.id)]}
        onReintentar={props.onReintentar}
        escala={vista.escala}
        pagina={vista.pagina}
        onPaginas={vista.setPaginas}
        indice={indice}
        total={lista.length}
        onIr={onIr}
      />

      <ViewerControls vista={vista} />

      {/* Misma capa que el pase y DESPUÉS en el árbol: con el mismo z-index,
          manda el que va después, así que el diálogo queda encima. */}
      <DeleteFromViewer
        {...props}
        soporte={confirmando ? soporte : null}
        onTerminar={() => setConfirmando(false)}
      />
    </div>
  );
}

/**
 * El hueco es OSCURO y la hoja flota encima.
 *
 * Antes el contenedor entero era blanco, así que un recibo de 620px en una
 * pantalla ancha dejaba dos franjas blancas enormes a los lados: en una app de
 * fondo verde oscuro, y de noche, eso deslumbra. Lo blanco tiene que ser el
 * papel y nada más, que es además como se ve un documento en cualquier visor.
 *
 * `overflow-auto`: ampliado, el recibo se recorre con la barra de
 * desplazamiento. Es lo que ya sabe hacer el navegador y no hay que reinventar
 * el arrastre.
 */
interface ViewerStageProps {
  soporte: Soporte;
  url: string | undefined;
  fallo: FalloDeSoporte | undefined;
  onReintentar: () => void;
  escala: number;
  pagina: number;
  onPaginas: (n: number) => void;
  indice: number;
  total: number;
  onIr: (i: number) => void;
}

function ViewerStage(props: ViewerStageProps) {
  const { indice, total, onIr } = props;

  return (
    <div className="flex min-h-0 flex-1 gap-2">
      {total > 1 && (
        <ViewerArrow
          hacia="anterior"
          deshabilitado={indice === 0}
          onClick={() => onIr(indice - 1)}
        />
      )}

      <ViewerSheet {...props} />

      {total > 1 && (
        <ViewerArrow
          hacia="siguiente"
          deshabilitado={indice === total - 1}
          onClick={() => onIr(indice + 1)}
        />
      )}
    </div>
  );
}

function ViewerSheet({
  soporte,
  url,
  fallo,
  onReintentar,
  escala,
  pagina,
  onPaginas,
}: ViewerStageProps) {
  return (
    <div className="relative flex min-w-0 flex-1 justify-center overflow-auto rounded-lg bg-sala/25 p-3 sm:p-6">
      {fallo ? (
        <div className="flex w-full items-center justify-center">
          <SoporteQueNoSeVe fallo={fallo} onReintentar={onReintentar} oscuro />
        </div>
      ) : !url ? (
        <div className="flex w-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-sala-tinta/70" aria-hidden="true" />
        </div>
      ) : soporte.mime_type.startsWith('image/') ? (
        <img
          src={url}
          alt={soporte.nombre_archivo}
          // El MISMO ancho que una página de PDF: si una imagen midiera otra
          // cosa, el botón de ampliar haría dos cosas distintas según qué
          // soporte estuviera abierto.
          className="h-fit max-w-none rounded-lg bg-white shadow-2xl"
          style={{ width: ANCHO_HOJA * escala }}
        />
      ) : (
        <PaginaPdf url={url} pagina={pagina} escala={escala} onPaginas={onPaginas} />
      )}
    </div>
  );
}

/** Borrar el soporte que se está viendo, y qué enseñar después. */
function DeleteFromViewer({
  transactionId,
  lista,
  indice,
  onIr,
  onCerrar,
  soporte,
  onTerminar,
}: ViewerProps & { soporte: Soporte | null; onTerminar: () => void }) {
  return (
    <ConfirmSupportDeletion
      transactionId={transactionId}
      soporte={soporte}
      onCancelar={onTerminar}
      onBorrado={() => {
        onTerminar();
        // Era el único: no queda nada que enseñar.
        if (lista.length === 1) onCerrar();
        else if (indice === lista.length - 1) onIr(indice - 1);
      }}
    />
  );
}
