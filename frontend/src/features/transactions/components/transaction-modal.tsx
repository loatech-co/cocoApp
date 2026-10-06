import type { ReactNode } from 'react';

import {
  useMovementSheet,
  type MovementSheet,
} from '@/features/transactions/hooks/use-movement-sheet';
import { rutaSeleccionada } from '@/features/transactions/model/transactions';
import {
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';
import { ModalBody, MODAL_PANEL } from '@/shared/ui/molecules/modal-parts';
import { Confirmation } from '@/shared/ui/organisms/confirmation';

import { CameraCapture } from './camera-capture';
import { MovementHeader } from './movement-header';
import { MovementSheetForm } from './movement-sheet-form';
import { Scanning } from './reading-progress';

interface MovementModalProps {
  isOpen: boolean;
  /** Sin movimiento, el formulario crea. Con movimiento, edita ese. */
  transaction?: Transaction | null | undefined;
  /**
   * El pago pendiente que se viene a confirmar, desde la tarjeta del resumen.
   *
   * ── Por qué es el pago entero y no solo su concepto ─────────────────────
   * Porque un pago pendiente ya trae dicho casi todo el movimiento: de qué
   * concepto es, cuándo vencía y cuánto suele costar. Pasando solo el
   * concepto, las otras dos cosas había que teclearlas mirando la misma
   * tarjeta que se acababa de pulsar.
   *
   * ── Y por qué eso cambia la ficha entera ────────────────────────────────
   * Confirmar un pago no es registrar un gasto desde cero: no hay que decidir
   * CÓMO empezar —el concepto ya está, lo que falta es el papel— así que se
   * abre directamente en el formulario, con los campos puestos y la columna
   * del soporte esperando. Lo que hay escrito es lo ESPERADO, y el soporte lo
   * corrige: ver `PendingSupportsColumn`.
   */
  payment?: PendingPayment | null;
  /** Con qué tipo abrir al CREAR. Lo elige el menú de "Nuevo movimiento". */
  defaultType?: TransactionType;
  onClose: () => void;
}

/**
 * El ÚNICO formulario de movimiento: crea y edita.
 *
 * Tener dos —uno para registrar y otro para corregir— garantiza que se
 * separen: se añade un campo en uno y se olvida en el otro, y la persona
 * descubre que solo puede poner notas cuando edita. Un solo componente, dos
 * modos.
 *
 * ── La cascada de tres niveles ──────────────────────────────────────────────
 * Centro de costos → categoría → concepto. Se guarda el CONCEPTO, que es la hoja:
 * los dos de arriba existen para sumar, no para clasificar. Elegir uno de
 * arriba y dejarlo ahí sería un movimiento que no aparece en ningún desglose
 * por concepto.
 *
 * Lo que necesita para funcionar lo junta `useMovementSheet`.
 */
export function TransactionModal(props: MovementModalProps) {
  const { isOpen, transaction, payment, defaultType = 'expense', onClose } = props;
  const sheet = useMovementSheet({
    abierta: isOpen,
    movimiento: transaction,
    pago: payment,
    tipoPorDefecto: defaultType,
    onCerrar: onClose,
  });
  const { ficha } = sheet;

  if (!isOpen) return null;
  const isEditing = Boolean(transaction);
  const { categoria, concepto } = rutaSeleccionada(sheet.arbol, ficha.categoryId);

  return (
    <SheetOverlay isEditing={isEditing} onClose={onClose}>
      <MovementHeader
        mode={{
          type: ficha.type,
          isEditing,
          isEditable: ficha.editable,
          // Lleva el `!movimiento` a propósito: `pago` sigue puesto mientras la
          // ficha está abierta, y en cuanto se guarda deja de ser un pendiente.
          // Sin eso, la ficha de un movimiento ya existente podría titularse
          // «Confirmar pago» por venir de esa tarjeta.
          isConfirming: payment != null && !transaction ? payment : null,
        }}
        onEdit={() => ficha.setEditable(true)}
        onDelete={() => ficha.setConfirmandoBorrado(true)}
        onClose={onClose}
      />

      {/* `min-h-0` es lo que permite que esto se encoja dentro de la columna:
          sin él mide lo que mida su contenido y se lleva por delante el alto
          máximo del panel. Y es a su vez una columna porque el panel tiene
          alto mínimo: con eso el formulario puede estirarse y llevarse sus
          botones al fondo en vez de dejarlos a media altura. */}
      <ModalBody>
        <MovementSteps sheet={sheet} transaction={transaction} onClose={onClose} />

        <ConfirmMovementDeletion
          isOpen={ficha.confirmandoBorrado}
          isBusy={sheet.guardar.eliminar.isPending}
          concept={concepto?.name ?? categoria?.name ?? t('transactions.sheet.conceptFallback')}
          onCancel={() => ficha.setConfirmandoBorrado(false)}
          onConfirm={() =>
            transaction &&
            sheet.guardar.eliminar.mutate(transaction.id, {
              onSuccess: () => {
                ficha.setConfirmandoBorrado(false);
                onClose();
              },
            })
          }
        />
      </ModalBody>
    </SheetOverlay>
  );
}

/** La cámara, la lectura o el formulario: lo que ocupa la ficha ahora. */
function MovementSteps({
  sheet,
  transaction,
  onClose,
}: {
  sheet: MovementSheet;
  transaction: Transaction | null | undefined;
  onClose: () => void;
}) {
  const { ficha, escanear } = sheet;

  if (ficha.paso === 'camara') {
    return (
      <CameraCapture
        onCapture={(a) => void escanear(a)}
        onClose={() => ficha.setPaso('formulario')}
      />
    );
  }

  if (ficha.paso === 'leyendo') {
    return <Scanning file={ficha.pendientes[0]} progress={ficha.progresoDeLectura} />;
  }

  return (
    <MovementSheetForm
      sheet={ficha}
      tree={sheet.arbol}
      isStatic={sheet.estatico}
      createInside={sheet.crear.crearDentro}
      isCreating={sheet.crear.creando}
      recent={sheet.recientes}
      transaction={transaction}
      scan={escanear}
      onSubmit={sheet.guardar.onSubmit}
      isSaving={sheet.guardar.guardando}
      onCancel={() => {
        if (!transaction) {
          onClose();
          return;
        }
        ficha.descartar();
        ficha.setEditable(false);
      }}
    />
  );
}

/** El velo y el panel de la ficha. */
function SheetOverlay({
  isEditing,
  onClose,
  children,
}: {
  isEditing: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      // El velo compartido, `--velo`. Aquí hubo un `bg-carbon-950/50` que no
      // pintaba nada —`carbon` no era un color de ninguna paleta de este
      // proyecto—, así que el modal flotaba sobre la página sin velo detrás.
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-[var(--velo)] backdrop-blur-sm',
        /*
          ── 24 hasta el borde de la pantalla, en el teléfono ──────────────
          La ficha no va a sangre. Pegada a los tres cantos, se lee como otra
          PANTALLA: se come el ancho entero, la esquina de abajo desaparece y
          lo único que dice que la aplicación sigue detrás es una franja de
          velo arriba. Separada, vuelve a leerse como lo que es —algo que está
          ENCIMA— y el velo se ve por los cuatro lados.

          Es distancia de la ficha al canto de la pantalla, no relleno de la
          ficha: lo de dentro sigue en 16, que es lo que `Modal` y
          `CabeceraDeModal` ya fijan.
        */
        'p-6',
        'se-revela sm:items-center sm:p-4',
      )}
      // `onMouseDown` sobre el velo, y no `onClick` en cualquier sitio.
      //
      // Con clic, un arrastre que EMPIEZA dentro del panel y termina fuera
      // —soltar el ratón un dedo más allá del borde— dispara el clic en el
      // ancestro común, que es el velo, y la ficha se cerraba con todo lo
      // escrito dentro. Aquí eso no es un caso raro: la previsualización del
      // soporte se recorre arrastrando, así que el gesto que cierra la ficha
      // es el mismo con el que se mira el recibo.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          isEditing
            ? t('transactions.sheet.editMovementTitle')
            : t('transactions.sheet.newMovementTitle')
        }
        // En móvil entra desde abajo y ocupa el ancho: es el patrón que la
        // gente espera de una app, y deja el pulgar cerca de los botones.
        //
        // El ancho lo pone `PANEL_DE_MODAL`, que lo topa en 720 para todas las
        // fichas. Y las cuatro esquinas, ya no solo las de arriba: separada
        // del borde de abajo, las de abajo también se ven, y dos cantos rectos
        // debajo de dos curvos es una caja a medio dibujar.
        className={cn(MODAL_PANEL, FLOATING_SURFACE, 'emerge', 'rounded-lg')}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Los tres golpes: qué está a punto de pasar, que no se deshace, y la
 * pregunta. Lo que se salta del patrón es la frase del medio, y no es un
 * detalle: el nombre de este movimiento ES el de su concepto, así que la
 * papelera parece estar apuntando al concepto. No lo está. Sin esa frase,
 * nadie borra un gasto mal anotado por miedo a llevarse «Aseo» por delante.
 */
function ConfirmMovementDeletion({
  isOpen,
  isBusy,
  concept,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  isBusy: boolean;
  concept: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Confirmation
      isOpen={isOpen}
      title={t('transactions.sheet.deleteMovementTitle')}
      isDestructive
      confirmLabel={t('common.delete')}
      isBusy={isBusy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {t('transactions.sheet.deleteWarning', { concept })}
    </Confirmation>
  );
}
