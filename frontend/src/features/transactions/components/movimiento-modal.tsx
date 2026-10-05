import type { ReactNode } from 'react';

import {
  useMovementSheet,
  type MovementSheet,
} from '@/features/transactions/hooks/use-movement-sheet';
import { rutaSeleccionada } from '@/features/transactions/model/movimientos';
import { cn } from '@/shared/lib/utils';
import { SUPERFICIE_FLOTANTE } from '@/shared/ui/foundations/superficie';
import { CuerpoDeModal, PANEL_DE_MODAL } from '@/shared/ui/molecules/modal-partes';
import { Confirmacion } from '@/shared/ui/organisms/confirmacion';
import type { PagoPendiente, Transaction, TransactionType } from '@coco/types';

import { Camara } from './camara';
import { MovementHeader } from './movement-header';
import { MovementSheetForm } from './movement-sheet-form';
import { Escaneando } from './reading-progress';

interface MovementModalProps {
  abierta: boolean;
  /** Sin movimiento, el formulario crea. Con movimiento, edita ese. */
  movimiento?: Transaction | null | undefined;
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
  pago?: PagoPendiente | null;
  /** Con qué tipo abrir al CREAR. Lo elige el menú de "Nuevo movimiento". */
  tipoPorDefecto?: TransactionType;
  onCerrar: () => void;
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
export function MovimientoModal(props: MovementModalProps) {
  const { abierta, movimiento, pago, tipoPorDefecto = 'expense', onCerrar } = props;
  const hoja = useMovementSheet({ abierta, movimiento, pago, tipoPorDefecto, onCerrar });
  const { ficha } = hoja;

  if (!abierta) return null;
  const editando = Boolean(movimiento);
  const { categoria, concepto } = rutaSeleccionada(hoja.arbol, ficha.categoryId);

  return (
    <SheetOverlay editando={editando} onCerrar={onCerrar}>
      <MovementHeader
        modo={{
          type: ficha.type,
          editando,
          editable: ficha.editable,
          // Lleva el `!movimiento` a propósito: `pago` sigue puesto mientras la
          // ficha está abierta, y en cuanto se guarda deja de ser un pendiente.
          // Sin eso, la ficha de un movimiento ya existente podría titularse
          // «Confirmar pago» por venir de esa tarjeta.
          confirmando: pago != null && !movimiento ? pago : null,
        }}
        onEditar={() => ficha.setEditable(true)}
        onEliminar={() => ficha.setConfirmandoBorrado(true)}
        onCerrar={onCerrar}
      />

      {/* `min-h-0` es lo que permite que esto se encoja dentro de la columna:
          sin él mide lo que mida su contenido y se lleva por delante el alto
          máximo del panel. Y es a su vez una columna porque el panel tiene
          alto mínimo: con eso el formulario puede estirarse y llevarse sus
          botones al fondo en vez de dejarlos a media altura. */}
      <CuerpoDeModal>
        <MovementSteps hoja={hoja} movimiento={movimiento} onCerrar={onCerrar} />

        <ConfirmMovementDeletion
          abierta={ficha.confirmandoBorrado}
          ocupada={hoja.guardar.eliminar.isPending}
          concepto={concepto?.name ?? categoria?.name ?? 'al que pertenece'}
          onCancelar={() => ficha.setConfirmandoBorrado(false)}
          onConfirmar={() =>
            movimiento &&
            hoja.guardar.eliminar.mutate(movimiento.id, {
              onSuccess: () => {
                ficha.setConfirmandoBorrado(false);
                onCerrar();
              },
            })
          }
        />
      </CuerpoDeModal>
    </SheetOverlay>
  );
}

/** La cámara, la lectura o el formulario: lo que ocupa la ficha ahora. */
function MovementSteps({
  hoja,
  movimiento,
  onCerrar,
}: {
  hoja: MovementSheet;
  movimiento: Transaction | null | undefined;
  onCerrar: () => void;
}) {
  const { ficha, escanear } = hoja;

  if (ficha.paso === 'camara') {
    return (
      <Camara onTomar={(a) => void escanear(a)} onCerrar={() => ficha.setPaso('formulario')} />
    );
  }

  if (ficha.paso === 'leyendo') {
    return <Escaneando archivo={ficha.pendientes[0]} progreso={ficha.progresoDeLectura} />;
  }

  return (
    <MovementSheetForm
      ficha={ficha}
      arbol={hoja.arbol}
      estatico={hoja.estatico}
      crearDentro={hoja.crear.crearDentro}
      creando={hoja.crear.creando}
      recientes={hoja.recientes}
      movimiento={movimiento}
      escanear={escanear}
      onSubmit={hoja.guardar.onSubmit}
      guardando={hoja.guardar.guardando}
      onCancelar={() => {
        if (!movimiento) {
          onCerrar();
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
  editando,
  onCerrar,
  children,
}: {
  editando: boolean;
  onCerrar: () => void;
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
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editando ? 'Editar movimiento' : 'Nuevo movimiento'}
        // En móvil entra desde abajo y ocupa el ancho: es el patrón que la
        // gente espera de una app, y deja el pulgar cerca de los botones.
        //
        // El ancho lo pone `PANEL_DE_MODAL`, que lo topa en 720 para todas las
        // fichas. Y las cuatro esquinas, ya no solo las de arriba: separada
        // del borde de abajo, las de abajo también se ven, y dos cantos rectos
        // debajo de dos curvos es una caja a medio dibujar.
        className={cn(PANEL_DE_MODAL, SUPERFICIE_FLOTANTE, 'emerge', 'rounded-lg')}
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
  abierta,
  ocupada,
  concepto,
  onCancelar,
  onConfirmar,
}: {
  abierta: boolean;
  ocupada: boolean;
  concepto: string;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Confirmacion
      abierta={abierta}
      titulo="Eliminar movimiento"
      peligrosa
      etiquetaConfirmar="Eliminar"
      ocupada={ocupada}
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
    >
      Estás a punto de borrar el registro de un movimiento. No se elimina el concepto “{concepto}”.
      Esta acción no se puede deshacer. ¿Estás seguro de que quieres continuar?
    </Confirmacion>
  );
}
