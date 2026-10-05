import { Loader2 } from 'lucide-react';
import type { ComponentProps, SubmitEvent } from 'react';

import type { MovementSheetState } from '@/features/transactions/hooks/use-movement-form';
import { nombreDelMovimiento, rutaSeleccionada } from '@/features/transactions/model/movimientos';
import { type Transaction } from '@/shared/api/generated/model';
import { DEFAULT_CURRENCY } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { PieDeModal } from '@/shared/ui/molecules/modal-partes';

import { MovementFields } from './movement-fields';
import { MovementReadColumn } from './movement-read-view';
import { SoportesPendientes } from './pending-supports';
import { Soportes } from './soportes';

/**
 * LA rejilla de una ficha de movimiento: el papel y lo que dice.
 *
 * ── Por qué una clase y no dos rejillas escritas ────────────────────────────
 * Porque la ficha tiene cinco caras —leer, editar, registrar a mano, registrar
 * con un archivo y, pronto, con una foto— y las cinco son lo mismo: un
 * documento a la izquierda y sus datos a la derecha. Escrita en cada una, la
 * de leer y la de editar ya se habían separado: al pulsar «Editar», el recibo
 * saltaba de sitio y las columnas cambiaban de ancho en el mismo gesto.
 *
 * ── El reparto: mitad y mitad ───────────────────────────────────────────────
 * Se probó a favor del papel —65 y 35— y no hacía falta. Desde que la columna
 * del documento perdió su fila de miniaturas, lo que hay en ella es una sola
 * previsualización de 350px de alto: darle dos tercios del ancho solo la deja
 * con aire a los lados mientras los campos de al lado se aprietan.
 *
 * Por debajo de `lg` no hay reparto: son dos filas apiladas, porque en un
 * teléfono dos columnas de 170px no son dos columnas.
 */
const REJILLA_DE_LA_FICHA = 'grid gap-5 lg:min-h-0 lg:flex-1 lg:auto-rows-fr lg:grid-cols-2';

type FieldsProps = ComponentProps<typeof MovementFields>;

type SheetFormProps = FieldsProps & {
  movimiento: Transaction | null | undefined;
  escanear: (archivo: File) => Promise<void>;
  onSubmit: (evento: SubmitEvent<HTMLFormElement>) => Promise<void>;
  guardando: boolean;
  onCancelar: () => void;
};

/**
 * El formulario de la ficha: el soporte a la izquierda, los datos a la derecha
 * —para leer o para editar— y el pie.
 */
export function MovementSheetForm({
  movimiento,
  escanear,
  onSubmit,
  guardando,
  onCancelar,
  ...campos
}: SheetFormProps) {
  const { ficha } = campos;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col gap-4">
      {/*
        ── La misma rejilla, se esté leyendo o editando ──────────────────────
        Y la MISMA en el árbol, no una copia en cada rama: la columna del papel
        se pinta una vez, fuera del condicional, así que al pulsar «Editar»
        React no la desmonta. Escrita dentro de las dos ramas, el soporte se
        descargaba otra vez en cada cambio —el marco se vaciaba, aparecía el
        girador y volvía la misma imagen que ya estaba en la memoria de la
        pestaña—.

        Lo único que cambia de lado a lado es la columna derecha: los campos o
        lo que dicen.
      */}
      <div className={REJILLA_DE_LA_FICHA}>
        <div className="flex flex-col">
          {movimiento ? (
            <Soportes transactionId={movimiento.id} />
          ) : (
            <PendingSupportsColumn ficha={ficha} escanear={escanear} />
          )}
        </div>

        {ficha.editable ? (
          <MovementFields {...campos} />
        ) : (
          <ReadColumn ficha={ficha} movimiento={movimiento} arbol={campos.arbol} />
        )}
      </div>

      {ficha.error && (
        <p role="alert" className="text-sm text-destructive">
          {ficha.error}
        </p>
      )}

      {/* Leyendo no hay pie: no hay nada que cancelar ni que guardar, y para
          salir ya está la equis de la esquina. Un botón "Cerrar" debajo de
          todo es una segunda puerta a la misma salida. */}
      {ficha.editable && (
        <PieDeModal>
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {movimiento ? 'Guardar' : 'Registrar'}
          </Button>
        </PieDeModal>
      )}
    </form>
  );
}

/**
 * Los soportes de un movimiento que todavía no existe.
 *
 * The FIRST document of a new movement is read. Whether it came from the drop
 * zone, the paste button, "Cargar archivo" or the camera: the receipt is what
 * turns the expected (or empty) value and date into the real ones. Attaching
 * it and having nothing happen left the document as decoration and forced
 * typing what the app can read.
 *
 * Only the first, and only when there is none yet: the rest stay attached
 * unread, because what fills the form is ONE document. What was read shows up
 * as a notice to verify, not as a saved fact.
 */
function PendingSupportsColumn({
  ficha,
  escanear,
}: {
  ficha: MovementSheetState;
  escanear: (archivo: File) => Promise<void>;
}) {
  return (
    <SoportesPendientes
      archivos={ficha.pendientes}
      onAñadir={(nuevos) => {
        const [primero, ...resto] = nuevos;

        if (ficha.pendientes.length === 0 && primero) {
          void escanear(primero).then(() => {
            if (resto.length > 0) ficha.setPendientes((p) => [...p, ...resto]);
          });
          return;
        }

        ficha.setPendientes((p) => [...p, ...nuevos]);
      }}
      onQuitar={(i) => ficha.setPendientes((p) => p.filter((_, n) => n !== i))}
      onTakePhoto={() => ficha.setPaso('camara')}
    />
  );
}

/** La columna de los datos, solo para mirar. */
function ReadColumn({
  ficha,
  movimiento,
  arbol,
}: {
  ficha: MovementSheetState;
  movimiento: Transaction | null | undefined;
  arbol: FieldsProps['arbol'];
}) {
  const { centro, categoria, concepto } = rutaSeleccionada(arbol, ficha.categoryId);

  return (
    <MovementReadColumn
      tipo={ficha.type}
      // El nombre sale del concepto, igual que en la tabla. Leía `description`,
      // que en un movimiento registrado a mano está vacío desde que la ficha
      // cambió su campo libre por un selector.
      nombre={movimiento ? nombreDelMovimiento(movimiento, arbol) : ''}
      valor={ficha.amount}
      currency={movimiento?.currency ?? DEFAULT_CURRENCY}
      fecha={ficha.date}
      periodo={movimiento?.period}
      ruta={[centro?.name, categoria?.name, concepto?.name].filter(Boolean) as string[]}
      notes={ficha.notes}
    />
  );
}
