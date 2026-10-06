import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useSupportFiles, useSupportUpload } from '@/features/transactions/hooks/use-support-files';
import { type Receipt } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { OverlayButton } from '@/shared/ui/molecules/overlay-control';

import { ConfirmSupportDeletion } from './confirm-support-deletion';
import { DropZone } from './support-drop-zone';
import { SupportPager } from './support-pager';
import { FilePreview } from './support-preview';
import { UploadPanel } from './support-upload-panel';
import { Lightbox } from './support-viewer';

/** Lo que la galería recuerda: cuál se ve, cuál se borra, cuál está en grande. */
function useSupportGallery(transactionId: number) {
  /**
   * Añadiendo: se abre el panel de subir encima de la ficha.
   *
   * La baldosa de 104px no da para más que un icono: ni explica qué se acepta
   * ni tiene sitio para el botón de pegar, que es de donde salen la mitad de
   * los soportes. Así que se añade en el cuadro grande, y de ahí se vuelve.
   */
  const [isAdding, setIsAdding] = useState(false);
  /** El soporte que se va a borrar desde la columna, a la espera del sí. */
  const [isDeleting, setIsDeleting] = useState<Receipt | null>(null);
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);
  /**
   * Cuál se está viendo arriba.
   *
   * Se abre una ficha para mirar el papel, no para mirar ocho cuadraditos de
   * 104px: la columna de un movimiento guardado enseña el documento en grande,
   * igual que la de uno que se está creando.
   */
  const [activeIndex, setActiveIndex] = useState(0);

  return {
    files: useSupportFiles(transactionId),
    upload: useSupportUpload(transactionId, () => setIsAdding(false)),
    isAdding,
    setIsAdding,
    isDeleting,
    setIsDeleting,
    enlargedIndex,
    setEnlargedIndex,
    activeIndex,
    setActiveIndex,
  };
}

type Gallery = ReturnType<typeof useSupportGallery>;

/**
 * Los soportes de un movimiento: el recibo que prueba que ese pago existió.
 *
 * ── Por qué el documento en grande y no pestañas ────────────────────────────
 * Porque "Receipt 1 de 8" no dice nada. Ocho pestañas iguales obligan a
 * abrirlas una por una para encontrar la factura que uno busca, que es
 * exactamente el trabajo que uno venía a evitar. Una página dibujada se
 * reconoce de un vistazo: el recibo del agua no se parece al del colegio.
 *
 * Los archivos se piden con el token y llegan como `blob:`; el porqué está en
 * `useSupportFiles`.
 */
export function Receipts({ transactionId }: { transactionId: number }) {
  const g = useSupportGallery(transactionId);
  const { list } = g.files;

  if (g.files.isLoading) {
    /*
      ── El alto ya reservado ──────────────────────────────────────────────
      Mientras se piden, la columna ocupa lo mismo que lo que va a llegar:
      el cuadro donde se sueltan mide 246 en el teléfono (su `min-h-36`, su
      relleno, el rótulo y el botón de pegar) y la previsualización, de 220
      para arriba. `min-h-62` son 248. Con un renglón suelto, la ficha —que en
      el teléfono cuelga del borde de abajo— crecía 230px al llegar la
      respuesta y todo lo de dentro saltaba hacia arriba: Lighthouse lo medía
      como un desplazamiento de 0,199. Si el cuadro cambia de alto, esto
      también.
    */
    return (
      <p className="flex min-h-62 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t('transactions.supports.searching')}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <GalleryPreview g={g} />

      {/*
        ── Sin fila de miniaturas ────────────────────────────────────────────
        Eran ocho cuadrados de 104px debajo del papel, y con la ficha topada en
        720 se comían un tercio de la columna para decir algo que el papel ya
        dice: cuál se está mirando. Lo que hacían —contar, elegir, añadir,
        quitar— cabe sobre el propio documento y ahí no gasta alto.
      */}
      {list.length === 0 && (
        <div className="flex min-h-0 flex-1">
          <DropZone
            isUploading={g.upload.isUploading}
            progress={g.upload.progress}
            isAlone
            onFiles={(a) => void g.upload.accept(a)}
          />
        </div>
      )}

      {g.upload.uploadError && (
        <p role="alert" className="text-xs text-destructive">
          {g.upload.uploadError}
        </p>
      )}

      <GalleryOverlays g={g} transactionId={transactionId} />
    </div>
  );
}

/** El soporte que se está viendo, con sus mandos encima. */
function GalleryPreview({ g }: { g: Gallery }) {
  const { list, urls, failures } = g.files;
  // El que se está viendo, recortado: borrar el último dejaba el índice
  // apuntando a un soporte que ya no existe.
  const i = Math.min(g.activeIndex, list.length - 1);
  const enseñado = i >= 0 ? list[i] : undefined;
  if (!enseñado) return null;

  return (
    <FilePreview
      // La clave es el SOPORTE y no su url: con la url, el marco se desmontaba
      // y se volvía a montar al llegar el archivo, que es justo el parpadeo que
      // esto viene a quitar.
      key={String(enseñado.id)}
      url={urls[String(enseñado.id)]}
      error={failures[String(enseñado.id)]}
      onRetry={g.files.retry}
      isImage={enseñado.mimeType.startsWith('image/')}
      // Aquí SÍ hay pase a pantalla completa —el soporte ya existe en el
      // servidor, con su descarga y su zoom—, así que la previsualización es
      // también la puerta.
      onOpen={() => g.setEnlargedIndex(i)}
      actions={
        <>
          <SupportPager index={i} total={list.length} onGo={g.setActiveIndex} />

          <OverlayButton
            label={t('transactions.supports.addAnother')}
            onClick={() => g.setIsAdding(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </OverlayButton>

          {/* Borrar pregunta antes: es lo único de esta barra que no se puede
              deshacer. */}
          <OverlayButton
            label={t('transactions.supports.deleteThis')}
            onClick={() => g.setIsDeleting(enseñado)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </OverlayButton>
        </>
      }
    />
  );
}

/** Lo que se abre encima de la galería: borrar, subir y el pase. */
function GalleryOverlays({ g, transactionId }: { g: Gallery; transactionId: number }) {
  const { list, urls, failures } = g.files;

  return (
    <>
      <ConfirmSupportDeletion
        transactionId={transactionId}
        receipt={g.isDeleting}
        onCancel={() => g.setIsDeleting(null)}
        onDeleted={() => {
          g.setIsDeleting(null);
          // Si se va el último de la fila, se enseña el anterior.
          g.setActiveIndex((n) => Math.max(0, Math.min(n, list.length - 2)));
        }}
      />

      {g.isAdding && (
        <UploadPanel
          isUploading={g.upload.isUploading}
          progress={g.upload.progress}
          onFiles={(a) => void g.upload.accept(a)}
          onClose={() => g.setIsAdding(false)}
        />
      )}

      {g.enlargedIndex !== null && (
        <Lightbox
          transactionId={transactionId}
          list={list}
          urls={urls}
          errors={failures}
          onRetry={g.files.retry}
          index={Math.min(g.enlargedIndex, list.length - 1)}
          onGoTo={g.setEnlargedIndex}
          onClose={() => g.setEnlargedIndex(null)}
        />
      )}
    </>
  );
}
