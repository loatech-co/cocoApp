import { ChevronLeft, ChevronRight, Download, Minus, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { useAlCambiar } from '@/shared/lib/al-cambiar';
import { BotonOscuro, LecturaDeMandos } from '@/shared/ui/molecules/overlay-control';
import type { Soporte } from '@coco/types';

/** Los saltos del zoom. Fijos y pocos: un control continuo pide precisión que
    nadie quiere darle a un recibo. */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
/** El índice del 100 %, por nombre: `ZOOMS.indexOf(2)` es el 200 %, no el 2º. */
const NORMAL = ZOOMS.indexOf(1);

/** El zoom y la página del pase, que vuelven a empezar con cada soporte. */
export function useViewerZoom(indice: number) {
  const [zoom, setZoom] = useState(NORMAL);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);

  // Cambiar de soporte reinicia el zoom y la página: seguir en la página 3 de
  // un recibo de una sola hoja deja el visor en blanco.
  useAlCambiar([indice], () => {
    setZoom(NORMAL);
    setPagina(1);
    setPaginas(1);
  });

  const cambiarZoom = useCallback(
    (paso: number) => setZoom((z) => Math.min(ZOOMS.length - 1, Math.max(0, z + paso))),
    [],
  );

  // `zoom` siempre está dentro de `ZOOMS`: lo recortan `cambiarZoom` y `NORMAL`.
  const escala = ZOOMS[zoom] ?? 1;

  return { zoom, setZoom, escala, cambiarZoom, pagina, setPagina, paginas, setPaginas };
}

/** El nombre, la posición y el peso del soporte, y lo que se hace con él entero. */
export function ViewerHeader({
  soporte,
  indice,
  total,
  url,
  onBorrar,
  onCerrar,
}: {
  soporte: Soporte;
  indice: number;
  total: number;
  url: string | undefined;
  onBorrar: () => void;
  onCerrar: () => void;
}) {
  return (
    <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-sala-tinta">{soporte.nombre_archivo}</p>
        <p className="tabular text-xs text-sala-tinta/60">
          {total > 1 && `${indice + 1} de ${total} · `}
          {(soporte.tamano / 1024).toFixed(0)} KB
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Descargar es un enlace, no un botón con JavaScript: el navegador
            ya sabe guardar un archivo, y con `download` se guarda con su
            nombre de verdad y no con el uuid del almacén. */}
        {url && (
          <a
            href={url}
            download={soporte.nombre_archivo}
            title="Descargar"
            aria-label={`Descargar ${soporte.nombre_archivo}`}
            className="flex size-9 items-center justify-center rounded-lg text-sala-tinta transition-colors hover:bg-sala-tinta/10"
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
        )}
        {/* Poder quitar lo que se acaba de subir por error. Sin esto, una
            foto movida se queda para siempre colgando del movimiento. */}
        <BotonOscuro onClick={onBorrar} etiqueta="Eliminar soporte">
          <Trash2 className="size-4" aria-hidden="true" />
        </BotonOscuro>
        <BotonOscuro onClick={onCerrar} etiqueta="Cerrar">
          <X className="size-4" aria-hidden="true" />
        </BotonOscuro>
      </div>
    </div>
  );
}

/** Una flecha a un lado del recibo, para pasar al soporte de al lado. */
export function ViewerArrow({
  hacia,
  deshabilitado,
  onClick,
}: {
  hacia: 'anterior' | 'siguiente';
  deshabilitado: boolean;
  onClick: () => void;
}) {
  return (
    <BotonOscuro
      onClick={onClick}
      deshabilitado={deshabilitado}
      etiqueta={hacia === 'anterior' ? 'Soporte anterior' : 'Soporte siguiente'}
      className="self-center"
    >
      {hacia === 'anterior' ? (
        <ChevronLeft className="size-5" aria-hidden="true" />
      ) : (
        <ChevronRight className="size-5" aria-hidden="true" />
      )}
    </BotonOscuro>
  );
}

interface ZoomProps {
  zoom: number;
  escala: number;
  /** Un paso (`1`, `-1`) o `null` para volver al tamaño normal. */
  onZoom: (paso: number | null) => void;
}

interface PageProps {
  pagina: number;
  paginas: number;
  onPagina: (cambiar: (pagina: number) => number) => void;
}

/** El zoom, y las páginas cuando el PDF tiene más de una. */
export function ViewerControls({ vista }: { vista: ReturnType<typeof useViewerZoom> }) {
  return (
    <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-3">
      <ZoomControls
        zoom={vista.zoom}
        escala={vista.escala}
        onZoom={(paso) => (paso === null ? vista.setZoom(NORMAL) : vista.cambiarZoom(paso))}
      />
      {vista.paginas > 1 && (
        <PageControls pagina={vista.pagina} paginas={vista.paginas} onPagina={vista.setPagina} />
      )}
    </div>
  );
}

function ZoomControls({ zoom, escala, onZoom }: ZoomProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-sala-tinta/10 px-1">
      <BotonOscuro onClick={() => onZoom(-1)} deshabilitado={zoom === 0} etiqueta="Alejar">
        <Minus className="size-4" aria-hidden="true" />
      </BotonOscuro>
      {/* El porcentaje se pulsa para volver al tamaño normal: es donde todo el
          mundo intenta pulsar cuando se ha perdido ampliando. */}
      <LecturaDeMandos ancho="zoom" onClick={() => onZoom(null)}>
        {Math.round(escala * 100)} %
      </LecturaDeMandos>
      <BotonOscuro
        onClick={() => onZoom(1)}
        deshabilitado={zoom === ZOOMS.length - 1}
        etiqueta="Acercar"
      >
        <Plus className="size-4" aria-hidden="true" />
      </BotonOscuro>
    </div>
  );
}

function PageControls({ pagina, paginas, onPagina }: PageProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-sala-tinta/10 px-1">
      <BotonOscuro
        onClick={() => onPagina((p) => p - 1)}
        deshabilitado={pagina === 1}
        etiqueta="Página anterior"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </BotonOscuro>
      <LecturaDeMandos ancho="paginas">
        Pág. {pagina} / {paginas}
      </LecturaDeMandos>
      <BotonOscuro
        onClick={() => onPagina((p) => p + 1)}
        deshabilitado={pagina === paginas}
        etiqueta="Página siguiente"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </BotonOscuro>
    </div>
  );
}
