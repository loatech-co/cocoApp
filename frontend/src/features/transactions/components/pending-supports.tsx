import { Camera, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';

import { t } from '@/shared/lib/i18n';
import { useObjectUrls } from '@/shared/lib/object-url';
import { Button } from '@/shared/ui/atoms/button';
import { OverlayButton } from '@/shared/ui/molecules/overlay-control';

import { DropZone } from './support-drop-zone';
import { SupportPager } from './support-pager';
import { FilePreview } from './support-preview';
import { UploadPanel } from './support-upload-panel';

interface PendingSupportsProps {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  /** Hands the sheet over to the camera; what it captures comes back through `onAñadir`'s owner. */
  onTakePhoto: () => void;
}

/**
 * Los soportes elegidos antes de que el movimiento exista.
 *
 * ── Por qué los `blob:` viven aquí ──────────────────────────────────────────
 * Porque los mira la previsualización y los mandos que pasan de uno a otro:
 * creados en cada sitio, el mismo archivo se cargaría dos veces en memoria.
 * Aquí se crean una vez y se sueltan juntos.
 */
export function PendingReceipts(props: PendingSupportsProps) {
  const { files, onAdd, onRemove, onTakePhoto } = props;
  const [activeIndex, setActiveIndex] = useState(0);
  const urls = useObjectUrls(files);
  /** El panel de subir, sobre la ficha. El mismo que abre la galería de uno
      ya guardado. */
  const [isAdding, setIsAdding] = useState(false);

  // El que se está viendo, recortado: quitar el último dejaba el índice
  // apuntando a un archivo que ya no existe.
  const i = Math.min(activeIndex, files.length - 1);
  const enseñado = i >= 0 ? files[i] : undefined;

  return (
    /*
      `min-h-0 flex-1` SIEMPRE, y no solo cuando está vacía.

      Lo llevaba solo en el caso vacío, que es cuando el hueco de soltar tiene
      que llenar la columna. Pero con un documento dentro pasa lo mismo: si
      esta caja mide lo que miden sus hijos, el previsualizador no tiene contra
      qué crecer y se queda en su alto mínimo con el resto de la columna en
      blanco debajo.
    */
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
        La misma columna que la de un movimiento ya guardado: UNA
        previsualización con sus mandos encima, sin fila de miniaturas. Lo que
        cambia es de dónde salen los archivos —de la memoria, no del servidor—
        y que aquí no hay pase a pantalla completa que abrir: el soporte no
        existe en ninguna parte hasta que se guarda el movimiento.
      */}
      {enseñado && (
        <FilePreview
          // La clave es el ARCHIVO y no su url: con la url, el marco se
          // desmontaba y se volvía a montar en cuanto se creaba el `blob:`.
          key={`${enseñado.name}-${i}`}
          url={urls[i]}
          isImage={enseñado.type.startsWith('image/')}
          actions={
            <PendingActions
              index={i}
              total={files.length}
              onGoTo={setActiveIndex}
              onAdd={() => setIsAdding(true)}
              onRemove={onRemove}
            />
          }
        />
      )}

      {files.length === 0 && (
        <EmptyPendingSupports
          onAdd={onAdd}
          onLoad={() => setIsAdding(true)}
          onTakePhoto={onTakePhoto}
        />
      )}

      {isAdding && (
        <UploadPanel
          isUploading={false}
          progress={0}
          onFiles={(added) => {
            onAdd(added);
            setIsAdding(false);
          }}
          onClose={() => setIsAdding(false)}
        />
      )}
    </div>
  );
}

/**
 * Sin ningún soporte todavía: el cuadro de soltar y las dos vías que antes
 * eran el selector.
 *
 * "Cargar archivo" opens the same upload panel the chooser opened —drag, pick
 * or paste, over the sheet— and "Tomar foto" hands the sheet to the camera.
 * Both end in `escanear` through the owner's `onAñadir`, so what a file or a
 * photo does to the form is exactly what it did from the chooser; only where
 * it starts changed.
 *
 * Same size for both and `outline` for both: neither is the primary action of
 * this sheet —that is "Registrar", at the foot— and a filled button here would
 * compete with it.
 */
function EmptyPendingSupports({
  onAdd,
  onLoad,
  onTakePhoto,
}: {
  onAdd: (files: File[]) => void;
  onLoad: () => void;
  onTakePhoto: () => void;
}) {
  return (
    <>
      <div className="flex min-h-0 flex-1">
        <DropZone isUploading={false} progress={0} isAlone onFiles={onAdd} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button type="button" variant="outline" size="sm" onClick={onLoad}>
          <Upload aria-hidden="true" />
          {t('transactions.supports.uploadFile')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onTakePhoto}>
          <Camera aria-hidden="true" />
          {t('transactions.supports.takePhoto')}
        </Button>
      </div>
    </>
  );
}

/** Los mandos sobre el documento: pasar, añadir y quitar. */
function PendingActions({
  index,
  total,
  onGoTo,
  onAdd,
  onRemove,
}: {
  index: number;
  total: number;
  onGoTo: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      <SupportPager index={index} total={total} onGo={onGoTo} />

      <OverlayButton label={t('transactions.supports.addAnother')} onClick={onAdd}>
        <Plus className="size-4" aria-hidden="true" />
      </OverlayButton>

      {/* Aquí no se pregunta antes de quitar: lo que se va es un archivo que
          todavía no se ha guardado en ninguna parte, así que volver a ponerlo
          es arrastrarlo otra vez. */}
      <OverlayButton
        label={t('transactions.supports.removeThis')}
        onClick={() => {
          onRemove(index);
          if (index > 0) onGoTo(index - 1);
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </OverlayButton>
    </>
  );
}
